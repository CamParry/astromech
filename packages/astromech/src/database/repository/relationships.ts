/**
 * Relationship index storage — the only place Kysely touches the relationships
 * table. Composed by every domain that can hold a relationship field (entries,
 * users, media).
 *
 * The index is derived from field data, so every write is a wholesale replace
 * of one source's edge set: one DELETE, then one chunked INSERT. Not a set-diff
 * — a diff needs an "which rows went away" branch, and that branch is exactly
 * where Payload's stale-relationship bug lives. The index is small and
 * rebuildable, so the extra write volume is the cheaper side of that trade.
 */
import type { RelationshipRow } from '@/database/schema';
import type { Db } from '@/database/types';
import type { RelationshipEdge, TargetKind } from '@/fields/relationship-edges';
import { encodeWith } from '@/database/codec';
import { getDb } from '@/database/registry';
import { relationshipsTable } from '@/database/schema';
import { createRepository } from './create-repository';

export type RelationshipRepository = ReturnType<typeof createRelationshipRepository>;

/** What holds the reference. Entries carry an entry type as well; users and
 *  media do not, so `type` is null for them. */
export type RelationshipSource = {
    id: string;
    kind: TargetKind;
    /** The entry type — qualified (`<ns>/<type>`) for a plugin type. */
    type?: string | null;
    /** True when the source row is a staged copy of a live entry. */
    staged?: boolean;
};

/**
 * One source and the edges its stored field data holds. What a domain's rebuild
 * collector yields; lives here so the domains and boot (which composes them)
 * share one shape. A source with no edges is still a source — it is how the
 * drift check sees rows left behind by data that no longer references anything.
 */
export type RelationshipIndexSource = {
    source: RelationshipSource;
    edges: RelationshipEdge[];
};

/**
 * Rows per INSERT. D1 caps a query at 100 bound parameters and each row binds
 * eight columns, so twelve rows is the largest statement that always fits.
 */
const INSERT_CHUNK_ROWS = 12;

/** Defaults to the registered db; pass a tx handle to scope it to a transaction. */
export function createRelationshipRepository(db: Db = getDb()) {
    const repository = createRepository(relationshipsTable, db);

    /**
     * Replace every edge recorded for one source. The delete covers the whole
     * source rather than a field at a time: there is then no "did this field go
     * away" case to get wrong, which is the failure mode a per-field replace has.
     */
    async function replaceForSource(
        source: RelationshipSource,
        edges: RelationshipEdge[]
    ): Promise<void> {
        await repository.deleteMany({ sourceId: source.id, sourceKind: source.kind });
        if (edges.length === 0) return;

        const { db: handle, table } = repository.query();
        const rows = edges.map((edge) =>
            encodeWith(relationshipsTable, {
                sourceId: source.id,
                sourceKind: source.kind,
                sourceType: source.type ?? null,
                schemaPath: edge.schemaPath,
                instancePath: edge.instancePath,
                targetId: edge.targetId,
                targetKind: edge.targetKind,
                sourceStaged: source.staged ?? false,
            })
        );
        for (let i = 0; i < rows.length; i += INSERT_CHUNK_ROWS) {
            await handle
                .insertInto(table)
                .values(rows.slice(i, i + INSERT_CHUNK_ROWS))
                .execute();
        }
    }

    /** Every edge recorded for one source, in no particular order. */
    async function findBySource(
        sourceId: string,
        sourceKind: TargetKind
    ): Promise<RelationshipRow[]> {
        return repository.findMany({ where: { sourceId, sourceKind } });
    }

    /**
     * Every edge pointing at one target. `includeStaged` is the delete-time
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
     * Every stored edge, optionally narrowed to one entry type. The rebuild and
     * drift reads use it: they must see rows whose source no longer exists, so
     * they cannot enumerate by source.
     */
    async function findAll(filter?: { sourceType?: string }): Promise<RelationshipRow[]> {
        return repository.findMany({
            where:
                filter?.sourceType !== undefined ? { sourceType: filter.sourceType } : {},
        });
    }

    /** Drop one source's edges — its row is gone, so its edges are meaningless. */
    async function deleteBySource(
        sourceId: string,
        sourceKind: TargetKind
    ): Promise<void> {
        await repository.deleteMany({ sourceId, sourceKind });
    }

    /**
     * Drop every edge involving a resource, in both directions. Deleting a
     * target does not rewrite the field data that references it — the dangling
     * id stays until that source is next written — but the index must not keep
     * claiming a reference to a row that no longer exists.
     */
    async function deleteByResource(id: string, kind: TargetKind): Promise<void> {
        await repository.deleteMany({ sourceId: id, sourceKind: kind });
        await repository.deleteMany({ targetId: id, targetKind: kind });
    }

    /** Wipe the index, optionally for one source kind. The rebuild entry point. */
    async function clear(sourceKind?: TargetKind): Promise<void> {
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
        query: repository.query,
    };
}
