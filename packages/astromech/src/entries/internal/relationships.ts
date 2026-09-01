/**
 * Relationship indexing (entries policy): derive an entry's edges from the
 * content it now holds and replace its rows in the index, plus the rebuild-side
 * collector that enumerates every entry as a source.
 */

import type {
    IndexedEdge,
    RelationshipIndexSource,
} from '@/database/repository/relationships';
import type { RelationshipEdge } from '@/fields/relationship-edges';
import type { JsonObject } from '@/types/index';
import { getConfig } from '@/config/registry';
import { createRepository } from '@/database/repository/create-repository';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { entriesTable, entryContentTable } from '@/database/tables';
import { qualifyEntryType, resolveEntryType } from '@/entries/entry-types.shared';
import { flattenEntryFields } from '@/fields/flatten';
import { collectRelationshipEdges } from '@/fields/relationship-edges';
import { getEntryRepository, hasCustomTable } from '../repository/registry';

/**
 * Re-index one entry. The index is keyed on the entry, so every locale it holds
 * contributes: a write to one locale re-reads the rest rather than replacing
 * their edges with its own.
 */
export async function indexEntryRelationships(
    entry: { id: string },
    fields: JsonObject,
    type: string
): Promise<void> {
    const edges = entryEdges(type, fields);
    if (edges === null) return;

    // A custom-table type has no `entry_content` rows: its single row is the
    // whole entry, so the fields just written are all there is to index.
    const all = hasCustomTable(type) ? edges : await storedEntryEdges(entry.id, type);

    await createRelationshipRepository().replaceForSource(
        { id: entry.id, kind: 'entry', type, staged: false },
        all
    );
}

/**
 * Every entry that could hold a relationship, with the edges its stored content
 * holds: all types, all locales, trashed rows included. Never re-derive from raw
 * input — item ids are minted by `parseFields`.
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
 * The edges every content row of one entry holds. Staged rows count: a pending
 * merge that references something is a reason not to delete it.
 */
async function storedEntryEdges(entryId: string, type: string): Promise<IndexedEdge[]> {
    const rows = await createRepository(entryContentTable).findMany({
        where: { entryId },
    });
    return entryContentEdges(type, rows);
}

/**
 * One edge per (instancePath, target) across an entry's content rows: two
 * locales holding the same reference are one row, and the index's primary key
 * would reject the second. An edge any canonical row carries is canonical; one
 * only a staged row carries is staged, so a pending merge's new reference
 * blocks a delete without appearing in a reverse lookup.
 *
 * The one place the rule lives — the write seam and the rebuild both call it.
 */
function entryContentEdges(
    type: string,
    rows: readonly { fields: unknown; stagedFor: string | null }[]
): IndexedEdge[] {
    const byKey = new Map<string, IndexedEdge>();
    for (const row of rows) {
        const staged = row.stagedFor !== null;
        for (const edge of entryEdges(type, (row.fields ?? {}) as JsonObject) ?? []) {
            const key = `${edge.instancePath}\0${edge.targetKind}\0${edge.targetId}`;
            const held = byKey.get(key);
            if (held === undefined) byKey.set(key, { ...edge, staged });
            else if (!staged) held.staged = false;
        }
    }
    return Array.from(byKey.values());
}

/**
 * Sources from the `entries` table, read directly rather than through
 * `repository.list()`: the list where-clause excludes staged rows unconditionally
 * and trashed rows by default, and the rebuild needs both.
 */
async function entriesTableEntrySources(
    type?: string
): Promise<RelationshipIndexSource[]> {
    const entries = await createRepository(entriesTable).findMany({
        where: type !== undefined ? { type } : {},
    });
    const contents = await createRepository(entryContentTable).findMany({
        where: type !== undefined ? { type } : {},
    });

    const rowsByEntry = new Map<string, typeof contents>();
    for (const row of contents) {
        const held = rowsByEntry.get(row.entryId);
        if (held) held.push(row);
        else rowsByEntry.set(row.entryId, [row]);
    }

    return entries.map((entry) => ({
        // An entry with a staged content row is still a live entry, so an entry
        // source is never itself staged; the per-edge flag carries staging.
        source: { id: entry.id, kind: 'entry' as const, type: entry.type, staged: false },
        edges: entryContentEdges(entry.type, rowsByEntry.get(entry.id) ?? []),
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
                source: { id: row.id, kind: 'entry', type, staged: row.staged },
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
