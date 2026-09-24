import type { RelationshipIndexSource } from '@/content/repository/relationships';
import type { RelationshipRow } from '@/database/tables';
import type { ResourceType } from '@/types/domain';
import { getConfig } from '@/config/registry';
import { getRelationshipRepository } from '@/content/repository/relationships';
import { allEntryRelationships } from '@/entries/internal/relationships';
import { allGlobalRelationships } from '@/globals/internal/relationships';
import { allMediaRelationships } from '@/media/internal/relationships';
import { allUserRelationships } from '@/users/internal/relationships';

/**
 * Relationships index repair — rebuild and drift check.
 *
 * The index is a derived function of (schema, data), so a config change
 * invalidates it exactly as a data change does. `rebuildRelationshipIndex`
 * recomputes and replaces; `checkRelationshipIndex` recomputes and diffs only.
 */

/** Scope of a repair run. `type` is an ENTRY type; it never covers globals, users or media. */
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

/** Recompute every scoped source's references and replace its rows. */
export async function rebuildRelationshipIndex(
    opts?: RelationshipIndexScope
): Promise<RebuildReport> {
    const sources = await collectSources(opts);
    const repository = getRelationshipRepository();

    let rowsWritten = 0;
    for (const { source, references } of sources) {
        // Per source rather than one bulk write, so the chunking that keeps an
        // INSERT under D1's 100-bound-parameter cap keeps applying.
        await repository.replaceForSource(source, references);
        rowsWritten += references.length;
    }

    // Read AFTER the replaces: what is left over then belongs to sources that no
    // longer exist, which no `replaceForSource` would ever reach.
    const stored = await repository.findMany(storedScope(opts));
    const live = new Set(sources.map(({ source }) => sourceKey(source.id, source.kind)));
    const orphanSources = new Map<string, { id: string; kind: ResourceType }>();
    let orphanRowsRemoved = 0;
    for (const row of stored) {
        const key = sourceKey(row.sourceId, row.sourceKind);
        if (live.has(key)) continue;
        orphanRowsRemoved += 1;
        orphanSources.set(key, { id: row.sourceId, kind: row.sourceKind });
    }
    for (const { id, kind } of orphanSources.values()) {
        await repository.deleteBySource(id, kind);
    }

    return { sourcesScanned: sources.length, rowsWritten, orphanRowsRemoved };
}

/** Diff the computed rows against the stored ones, writing nothing. */
export async function checkRelationshipIndex(
    opts?: RelationshipIndexScope
): Promise<DriftReport> {
    const sources = await collectSources(opts);
    const computed = new Map<string, RelationshipRow>();
    for (const { source, references } of sources) {
        for (const reference of references) {
            const row: RelationshipRow = {
                sourceId: source.id,
                sourceKind: source.kind,
                sourceType: source.type ?? null,
                schemaPath: reference.schemaPath,
                instancePath: reference.instancePath,
                targetId: reference.targetId,
                targetKind: reference.targetKind,
                sourceStaged: reference.staged ?? source.staged ?? false,
            };
            computed.set(rowKey(row), row);
        }
    }

    const stored = await getRelationshipRepository().findMany(storedScope(opts));
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
    const config = getConfig();
    if (opts?.type !== undefined) {
        return allEntryRelationships(config, { type: opts.type });
    }
    return [
        ...(await allEntryRelationships(config)),
        ...(await allGlobalRelationships(config)),
        ...(await allUserRelationships(config)),
        ...(await allMediaRelationships(config)),
    ];
}

/** The stored rows a scoped run is allowed to compare against or delete. */
function storedScope(opts?: RelationshipIndexScope): { entryType?: string } {
    return opts?.type !== undefined ? { entryType: opts.type } : {};
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
function sourceKey(id: string, kind: ResourceType): string {
    return `${id}\u0000${kind}`;
}
