/**
 * Relationship index repository: the only place Kysely touches the
 * relationships table. Every write is a wholesale replace of one source's
 * references (DELETE then chunked INSERT), never a set-diff.
 */
import type { RelationshipRow } from '@/database/tables';
import type { FieldReference } from '@/fields/references';
import type { ResourceType, TargetKind } from '@/types/domain';
import { createRepository } from '@/database/repository/create-repository';
import { relationshipsTable } from '@/database/tables';

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
 * A reference with the columns a caller varies row by row. `locale` is the
 * locale of the content row holding it. `staged` overrides
 * `RelationshipSource.staged`: an entry's canonical and staged content rows are
 * a single source, so only the references a locale's staged row alone holds are
 * staged. Absent means "whatever the source says".
 */
export type IndexedReference = FieldReference & { locale: string; staged?: boolean };

/**
 * One source and the references its stored field data holds. What a domain's
 * rebuild collector yields; lives here so the domains and boot (which composes
 * them) share one shape. A source with no references is still a source: it is
 * how the drift check sees rows left behind by data that references nothing.
 */
export type RelationshipIndexSource = {
    source: RelationshipSource;
    references: IndexedReference[];
};

/** The index row one reference of one source is stored as. */
export function toRelationshipRow(
    source: RelationshipSource,
    reference: IndexedReference
): RelationshipRow {
    return {
        sourceId: source.id,
        sourceKind: source.kind,
        sourceType: source.type ?? null,
        locale: reference.locale,
        schemaPath: reference.schemaPath,
        instancePath: reference.instancePath,
        targetId: reference.targetId,
        targetKind: reference.targetKind,
        sourceStaged: reference.staged ?? source.staged ?? false,
    };
}

/**
 * Rows per INSERT. D1 caps a query at 100 bound parameters and each row binds
 * nine columns, so eleven rows is the largest statement that always fits.
 */
const INSERT_CHUNK_ROWS = 11;

function createRelationshipRepository() {
    const repository = createRepository(relationshipsTable);

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

        const rows = references.map((reference) => toRelationshipRow(source, reference));
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
     * Every reference pointing at one target, in every locale. `includeStaged` is
     * the delete-time question: a pending merge that references the target still
     * counts, even though a reverse lookup for display would not show it.
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
    async function findMany(filter?: { entryType?: string }): Promise<RelationshipRow[]> {
        return repository.findMany({
            where:
                filter?.entryType !== undefined
                    ? { sourceKind: 'entry', sourceType: filter.entryType }
                    : {},
        });
    }

    /** Drop one source's references: its row is gone, so they are meaningless. */
    async function deleteBySource(
        sourceId: string,
        sourceKind: ResourceType
    ): Promise<void> {
        await repository.deleteMany({ sourceId, sourceKind });
    }

    /**
     * Drop every reference involving a resource, in both directions. Deleting a
     * target does not rewrite the field data that references it (the dangling
     * id stays until that source is next written), but the index must not keep
     * claiming a reference to a row that no longer exists.
     */
    async function deleteByResource(id: string, kind: TargetKind): Promise<void> {
        await repository.deleteMany({ sourceId: id, sourceKind: kind });
        await repository.deleteMany({ targetId: id, targetKind: kind });
    }

    /** Wipe the index, optionally for one source kind. The rebuild entry point. */
    async function deleteMany(sourceKind?: ResourceType): Promise<void> {
        await repository.deleteMany(sourceKind ? { sourceKind } : {});
    }

    return {
        replaceForSource,
        findMany,
        findBySource,
        findByTarget,
        deleteBySource,
        deleteByResource,
        deleteMany,
    };
}

/** The relationship index repository. Stateless: the db handle resolves per call. */
export const relationshipRepository = createRelationshipRepository();
