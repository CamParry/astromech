/**
 * Relationship indexing (entries policy): derive an entry's edges from the field
 * data just written and replace its rows in the index, plus the rebuild-side
 * collector that enumerates every entry as a source.
 */

import config from 'virtual:astromech/config';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import type { RelationshipIndexSource } from '@/database/storage/relationships.js';
import { createStorage } from '@/database/storage/create-storage.js';
import { collectRelationshipEdges } from '@/fields/relationship-edges.js';
import type { RelationshipEdge } from '@/fields/relationship-edges.js';
import { flattenEntryFields } from '@/fields/helpers.js';
import { entries as entriesTable } from '../schema.js';
import { getEntryStorage, hasEntryStorageOverride } from '../storage/registry.js';
import { qualifyEntryType, resolveEntryType } from '../type-ids.js';
import type { JsonObject } from '@/types/index.js';
import type { StorageDb } from '../storage/types.js';

/**
 * Re-index one entry. `fields` must be post-`processFields` values — item ids
 * are minted during that pass, and instance paths address nothing without them.
 */
export async function indexEntryRelationships(
    entry: { id: string; stagedFor?: string | null },
    fields: JsonObject,
    typeName: string,
    db?: StorageDb
): Promise<void> {
    const edges = entryEdges(typeName, fields);
    if (edges === null) return;

    await createRelationshipStorage(db).replaceForSource(
        {
            id: entry.id,
            kind: 'entry',
            type: typeName,
            staged: entry.stagedFor != null,
        },
        edges
    );
}

/**
 * Every entry that could hold a relationship, with the edges its STORED field
 * data holds. Covers all types, all locales, and both trashed and staged rows —
 * a staged row is a real row with its own edges.
 *
 * Never re-derive this from raw input: the traversal mints missing item ids, so
 * it is only deterministic over data that has already been through
 * `processFields`, which stored data has by definition.
 */
export async function collectEntryRelationshipSources(opts?: {
    type?: string;
}): Promise<RelationshipIndexSource[]> {
    return [
        ...(await builtInEntrySources(opts?.type)),
        ...(await tableBackedEntrySources(opts?.type)),
    ];
}

/**
 * The edges declared by `typeName`'s schema and held in `fields`, or null when
 * no such type is configured — the write seam skips those, the rebuild reports
 * them as a source holding nothing so their stale rows read as drift.
 */
function entryEdges(typeName: string, fields: JsonObject): RelationshipEdge[] | null {
    const entryTypeConfig = resolveEntryType(config, typeName);
    if (!entryTypeConfig) return null;
    return collectRelationshipEdges(flattenEntryFields(entryTypeConfig.fields), fields);
}

/**
 * Sources from the `entries` table, read directly rather than through
 * `storage.list()`: the list where-clause excludes staged rows unconditionally
 * and trashed rows by default, and the rebuild needs both.
 */
async function builtInEntrySources(type?: string): Promise<RelationshipIndexSource[]> {
    const rows = await createStorage(entriesTable).findMany({
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
 * Sources for entry types backed by their own storage (`tableStorage`). Their
 * rows are not in the `entries` table but they are indexed on write, so leaving
 * them out would report every one of their edges as drift.
 */
async function tableBackedEntrySources(
    type?: string
): Promise<RelationshipIndexSource[]> {
    const types = configuredEntryTypes()
        .filter(hasEntryStorageOverride)
        .filter((candidate) => type === undefined || candidate === type);

    const collected: RelationshipIndexSource[] = [];
    for (const typeName of types) {
        const { data } = await getEntryStorage(typeName).list({
            type: typeName,
            limit: 'all',
            locale: 'all',
        });
        for (const record of data) {
            collected.push({
                source: {
                    id: record.id,
                    kind: 'entry',
                    type: typeName,
                    staged: record.stagedFor != null,
                },
                edges: entryEdges(typeName, record.fields) ?? [],
            });
        }
    }
    return collected;
}

/** Every entry type id in the resolved config; plugin types qualified. */
function configuredEntryTypes(): string[] {
    return [
        ...Object.keys(config.entries),
        ...Object.entries(config.pluginEntries).flatMap(([plugin, types]) =>
            Object.keys(types).map((type) => qualifyEntryType(plugin, type))
        ),
    ];
}
