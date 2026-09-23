/**
 * Relationship index repository — the only place Kysely touches the
 * relationships table. Every write is a wholesale replace of one source's
 * references (DELETE then chunked INSERT), never a set-diff.
 */
import type { RelationshipRow } from '@/database/tables';
import type { Db } from '@/database/types';
import type { FieldReference } from '@/fields/references';
import type { ResourceType, TargetKind } from '@/types/domain';
import { relationshipsTable } from '@/database/tables';
import { createRepository } from './create-repository';

export type RelationshipRepository = ReturnType<typeof createRelationshipRepository>;

/** What holds the reference. An entry carries its entry type and a global its
 *  key; users and media carry neither, so `type` is null for them. */
export type RelationshipSource = {
    id: string;
    kind: ResourceType;
    /** The entry type (qualified `<ns>/<type>` for a plugin's) or the global's key. */
    type?: string | null;
    /** True when the source row is a staged copy of a live entry. */
    staged?: boolean;
};

/**
 * A reference with the one source column a caller may vary row by row. `staged`
 * overrides `RelationshipSource.staged`: an entry's canonical and staged content
 * rows are a single source, so only the references the staged row alone holds
 * are staged. Absent means "whatever the source says".
 */
export type IndexedReference = FieldReference & { staged?: boolean };

/**
 * One source and the references its stored field data holds. What a domain's
 * rebuild collector yields; lives here so the domains and boot (which composes
 * them) share one shape. A source with no references is still a source — it is
 * how the drift check sees rows left behind by data that references nothing.
 */
export type RelationshipIndexSource = {
    source: RelationshipSource;
    references: IndexedReference[];
};

/**
 * Rows per INSERT. D1 caps a query at 100 bound parameters and each row binds
 * eight columns, so twelve rows is the largest statement that always fits.
 */
const INSERT_CHUNK_ROWS = 12;

/** Resolves `getDb()` per call unless a handle is passed — a test seam only. */
export function createRelationshipRepository(db?: Db) {
    const repository = createRepository(relationshipsTable, db);

    /**
     * Replace every reference recorded for one source. The delete covers the
     * whole source rather than a field at a time: there is then no "did this
     * field go away" case to get wrong, which a per-field replace gets wrong.
     */
    async function replaceForSource(
        source: RelationshipSource,
        references: IndexedReference[]
    ): Promise<void> {
        await repository.deleteMany({ sourceId: source.id, sourceKind: source.kind });
        if (references.length === 0) return;

        const rows = references.map((reference) => ({
            sourceId: source.id,
            sourceKind: source.kind,
            sourceType: source.type ?? null,
            schemaPath: reference.schemaPath,
            instancePath: reference.instancePath,
            targetId: reference.targetId,
            targetKind: reference.targetKind,
            sourceStaged: reference.staged ?? source.staged ?? false,
        }));
        for (let i = 0; i < rows.length; i += INSERT_CHUNK_ROWS) {
            await repository.createMany(rows.slice(i, i + INSERT_CHUNK_ROWS));
        }
    }

    /** Every reference recorded for one source, in no particular order. */
    async function findBySource(
        sourceId: string,
        sourceKind: ResourceType
    ): Promise<RelationshipRow[]> {
        return repository.findMany({ where: { sourceId, sourceKind } });
    }

    /**
     * Every reference pointing at one target. `includeStaged` is the delete-time
     * question — a pending merge that references the target still counts, even
     * though a reverse lookup for display would not show it.
     */
    async function findByTarget(
        targetId: string,
        targetKind: TargetKind,
        opts?: { includeStaged?: boolean }
    ): Promise<RelationshipRow[]> {
        return repository.findMany({
            where: {
                targetId,
                targetKind,
                ...(opts?.includeStaged === true ? {} : { sourceStaged: false }),
            },
        });
    }

    /**
     * Every stored reference, optionally narrowed to one entry type. The rebuild and
     * drift reads use it: they must see rows whose source no longer exists, so
     * they cannot enumerate by source. A global's key shares the `sourceType`
     * column, so a type filter also names the entry kind.
     */
    async function findAll(filter?: { entryType?: string }): Promise<RelationshipRow[]> {
        return repository.findMany({
            where:
                filter?.entryType !== undefined
                    ? { sourceKind: 'entry', sourceType: filter.entryType }
                    : {},
        });
    }

    /** Drop one source's references — its row is gone, so they are meaningless. */
    async function deleteBySource(
        sourceId: string,
        sourceKind: ResourceType
    ): Promise<void> {
        await repository.deleteMany({ sourceId, sourceKind });
    }

    /**
     * Drop every reference involving a resource, in both directions. Deleting a
     * target does not rewrite the field data that references it — the dangling
     * id stays until that source is next written — but the index must not keep
     * claiming a reference to a row that no longer exists.
     */
    async function deleteByResource(id: string, kind: TargetKind): Promise<void> {
        await repository.deleteMany({ sourceId: id, sourceKind: kind });
        await repository.deleteMany({ targetId: id, targetKind: kind });
    }

    /** Wipe the index, optionally for one source kind. The rebuild entry point. */
    async function clear(sourceKind?: ResourceType): Promise<void> {
        await repository.deleteMany(sourceKind ? { sourceKind } : {});
    }

    return {
        replaceForSource,
        findAll,
        findBySource,
        findByTarget,
        deleteBySource,
        deleteByResource,
        clear,
    };
}
