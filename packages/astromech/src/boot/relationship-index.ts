/**
 * Relationships index repair — rebuild and drift check.
 *
 * The index is a derived function of (schema, data), so a config change
 * invalidates it exactly as a data change does. These two are the repair path:
 * `rebuildRelationshipIndex` recomputes and replaces, `checkRelationshipIndex`
 * recomputes and diffs without writing. Neither runs automatically at startup —
 * an automatic repair hides the drift it papers over.
 *
 * Boot owns them because they compose all three source domains, which no
 * domain may do. Do NOT import this module from `astro.ts` or `boot.ts`: it
 * pulls in domain services and their `virtual:astromech/config`, which does not
 * resolve during Astro's plain-Node config load.
 *
 * ## Only ever recompute from STORED data
 *
 * The edge traversal mints a missing item `_id` with `crypto.randomUUID()`, so
 * it is non-deterministic on data that has never been through `processFields`.
 * A rebuild is safe only because every collector reads stored rows, whose items
 * already carry their ids — re-deriving from raw input would invent fresh ids
 * on every run and produce instance paths that address nothing.
 *
 * Both functions load every source's field data into memory. That is fine for a
 * SQLite-only v1 and is the first thing to revisit if this ever needs to scale.
 */

import {
    createRelationshipStorage,
    type RelationshipIndexSource,
} from '@/database/storage/relationships';
import type { RelationshipRow } from '@/database/schema';
import type { TargetKind } from '@/fields/relationship-edges';
import { collectEntryRelationshipSources } from '@/entries/internal/relationships';
import { collectUserRelationshipSources } from '@/users/service';
import { collectMediaRelationshipSources } from '@/media/internal/relationships';

/** Scope of a repair run. `type` is an ENTRY type; it never covers user or media. */
export type RelationshipIndexScope = { type?: string };

export type RebuildReport = {
    sourcesScanned: number;
    rowsWritten: number;
    /** Rows whose source row no longer exists at all (a purged entry, say). */
    orphanRowsRemoved: number;
};

export type DriftReport = {
    sourcesScanned: number;
    /** Computed from field data but not stored. */
    missing: RelationshipRow[];
    /** Stored but held by no field data. */
    unexpected: RelationshipRow[];
    /** Same key, different `sourceType` / `schemaPath` / `sourceStaged`. */
    mismatched: { stored: RelationshipRow; computed: RelationshipRow }[];
};

/** Recompute every scoped source's edges and replace its rows. */
export async function rebuildRelationshipIndex(
    opts?: RelationshipIndexScope
): Promise<RebuildReport> {
    const sources = await collectSources(opts);
    const storage = createRelationshipStorage();

    let rowsWritten = 0;
    for (const { source, edges } of sources) {
        // Per source rather than one bulk write, so the chunking that keeps an
        // INSERT under D1's 100-bound-parameter cap keeps applying.
        await storage.replaceForSource(source, edges);
        rowsWritten += edges.length;
    }

    // Read AFTER the replaces: what is left over then belongs to sources that no
    // longer exist, which no `replaceForSource` would ever reach.
    const stored = await storage.findAll(storedScope(opts));
    const live = new Set(sources.map(({ source }) => sourceKey(source.id, source.kind)));
    const orphanSources = new Map<string, { id: string; kind: TargetKind }>();
    let orphanRowsRemoved = 0;
    for (const row of stored) {
        const key = sourceKey(row.sourceId, row.sourceKind);
        if (live.has(key)) continue;
        orphanRowsRemoved += 1;
        orphanSources.set(key, { id: row.sourceId, kind: row.sourceKind });
    }
    for (const { id, kind } of orphanSources.values()) {
        await storage.deleteBySource(id, kind);
    }

    return { sourcesScanned: sources.length, rowsWritten, orphanRowsRemoved };
}

/** Diff the computed rows against the stored ones, writing nothing. */
export async function checkRelationshipIndex(
    opts?: RelationshipIndexScope
): Promise<DriftReport> {
    const sources = await collectSources(opts);
    const computed = new Map<string, RelationshipRow>();
    for (const { source, edges } of sources) {
        for (const edge of edges) {
            const row: RelationshipRow = {
                sourceId: source.id,
                sourceKind: source.kind,
                sourceType: source.type ?? null,
                schemaPath: edge.schemaPath,
                instancePath: edge.instancePath,
                targetId: edge.targetId,
                targetKind: edge.targetKind,
                sourceStaged: source.staged ?? false,
            };
            computed.set(rowKey(row), row);
        }
    }

    const stored = await createRelationshipStorage().findAll(storedScope(opts));
    const storedByKey = new Map(stored.map((row) => [rowKey(row), row]));

    const mismatched: DriftReport['mismatched'] = [];
    const missing: RelationshipRow[] = [];
    for (const [key, row] of computed) {
        const found = storedByKey.get(key);
        if (!found) {
            missing.push(row);
        } else if (
            found.sourceType !== row.sourceType ||
            found.schemaPath !== row.schemaPath ||
            found.sourceStaged !== row.sourceStaged
        ) {
            mismatched.push({ stored: found, computed: row });
        }
    }

    return {
        sourcesScanned: sources.length,
        missing,
        unexpected: stored.filter((row) => !computed.has(rowKey(row))),
        mismatched,
    };
}

/**
 * Sources from every domain — or entries only when a type is named. A type
 * filter is entry-type scoped, so user and media sources must stay out of the
 * run entirely: including them unscoped would be fine, but pairing them with
 * the type-scoped stored rows below would make every user and media row look
 * unexpected and a rebuild would wipe them.
 */
async function collectSources(
    opts?: RelationshipIndexScope
): Promise<RelationshipIndexSource[]> {
    if (opts?.type !== undefined) {
        return collectEntryRelationshipSources({ type: opts.type });
    }
    return [
        ...(await collectEntryRelationshipSources()),
        ...(await collectUserRelationshipSources()),
        ...(await collectMediaRelationshipSources()),
    ];
}

/** The stored rows a scoped run is allowed to compare against or delete. */
function storedScope(opts?: RelationshipIndexScope): { sourceType?: string } {
    return opts?.type !== undefined ? { sourceType: opts.type } : {};
}

/**
 * The row's composite primary key, rendered for map lookup. NUL-joined so no id
 * or path can spell another row's key.
 */
function rowKey(row: RelationshipRow): string {
    return [
        row.sourceId,
        row.sourceKind,
        row.instancePath,
        row.targetId,
        row.targetKind,
    ].join('\u0000');
}

/** The (id, kind) half of the key — what `deleteBySource` addresses. */
function sourceKey(id: string, kind: TargetKind): string {
    return `${id}\u0000${kind}`;
}
