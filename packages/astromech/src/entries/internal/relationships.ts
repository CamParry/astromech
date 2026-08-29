/**
 * Relationship indexing (entries policy): derive an entry's edges from the field
 * data just written and replace its rows in the index, plus the rebuild-side
 * collector that enumerates every entry as a source.
 */

import type { RelationshipIndexSource } from '@/database/repository/relationships';
import type { RelationshipEdge } from '@/fields/relationship-edges';
import type { JsonObject } from '@/types/index';
import { getConfig } from '@/config/registry';
import { createRepository } from '@/database/repository/create-repository';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { qualifyEntryType, resolveEntryType } from '@/entries/entry-types.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { collectRelationshipEdges } from '@/fields/relationship-edges';
import { getEntryRepository, hasCustomTable } from '../repository/registry';
import { entriesTable } from '../tables';

/**
 * Re-index one entry. `fields` must be post-`parseFields` values — item ids
 * are minted during that pass, and instance paths address nothing without them.
 */
export async function indexEntryRelationships(
    entry: { id: string; stagedFor?: string | null },
    fields: JsonObject,
    type: string
): Promise<void> {
    const edges = entryEdges(type, fields);
    if (edges === null) return;

    await createRelationshipRepository().replaceForSource(
        {
            id: entry.id,
            kind: 'entry',
            type,
            staged: entry.stagedFor != null,
        },
        edges
    );
}

/**
 * Every entry that could hold a relationship, with the edges its stored field
 * data holds: all types, all locales, trashed and staged rows included. Never
 * re-derive from raw input — item ids are minted by `parseFields`.
 */
export async function collectEntryRelationshipSources(options?: {
    type?: string;
}): Promise<RelationshipIndexSource[]> {
    return [
        ...(await entriesTableEntrySources(options?.type)),
        ...(await customTableEntrySources(options?.type)),
    ];
}

/**
 * The edges declared by `type`'s schema and held in `fields`, or null when
 * no such type is configured — the write seam skips those, the rebuild reports
 * them as a source holding nothing so their stale rows read as drift.
 */
function entryEdges(type: string, fields: JsonObject): RelationshipEdge[] | null {
    const entryType = resolveEntryType(getConfig(), type);
    if (!entryType) return null;
    return collectRelationshipEdges(flattenEntryFields(entryType.fields), fields);
}

/**
 * Sources from the `entries` table, read directly rather than through
 * `repository.list()`: the list where-clause excludes staged rows unconditionally
 * and trashed rows by default, and the rebuild needs both.
 */
async function entriesTableEntrySources(
    type?: string
): Promise<RelationshipIndexSource[]> {
    const rows = await createRepository(entriesTable).findMany({
        where: type !== undefined ? { type } : {},
    });
    return rows.map((row) => ({
        source: {
            id: row.id,
            kind: 'entry' as const,
            type: row.type,
            staged: row.stagedFor != null,
        },
        edges: entryEdges(row.type, (row.fields ?? {}) as JsonObject) ?? [],
    }));
}

/**
 * Sources for entry types backed by their own repository (`tableRepository`).
 * Their rows are not in the `entries` table but they are indexed on write, so
 * leaving them out would report every one of their edges as drift.
 */
async function customTableEntrySources(
    onlyType?: string
): Promise<RelationshipIndexSource[]> {
    const types = configuredEntryTypes()
        .filter(hasCustomTable)
        .filter((type) => onlyType === undefined || type === onlyType);

    const collected: RelationshipIndexSource[] = [];
    for (const type of types) {
        const { data: rows } = await getEntryRepository(type).list({
            type,
            limit: 'all',
            locale: 'all',
        });
        for (const row of rows) {
            collected.push({
                source: {
                    id: row.id,
                    kind: 'entry',
                    type,
                    staged: row.stagedFor != null,
                },
                edges: entryEdges(type, row.fields) ?? [],
            });
        }
    }
    return collected;
}

/** Every entry type id in the resolved config; plugin types qualified. */
function configuredEntryTypes(): string[] {
    const config = getConfig();
    return [
        ...Object.keys(config.entries),
        ...Object.entries(config.pluginEntries).flatMap(([plugin, types]) =>
            Object.keys(types).map((type) => qualifyEntryType(plugin, type))
        ),
    ];
}
