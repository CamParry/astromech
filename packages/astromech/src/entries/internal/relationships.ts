/**
 * Relationship indexing (entries policy): derive an entry's references from the
 * content it now holds and replace its rows in the index, plus the rebuild-side
 * collector that enumerates every entry as a source.
 */

import type {
    IndexedReference,
    RelationshipIndexSource,
} from '@/database/repository/relationships';
import type { FieldReference } from '@/fields/references';
import type { JsonObject, ResolvedConfig } from '@/types/index';
import { mergeContentReferences } from '@/content/relationships';
import { createRepository } from '@/database/repository/create-repository';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { entriesTable, entryContentTable } from '@/database/tables';
import { resolveEntryType } from '@/entries/entry-types';
import { flattenEntryFields } from '@/fields/flatten';
import { findReferences } from '@/fields/references';
import { getEntryRepository, hasCustomTable } from '../repository/registry';

/**
 * Re-index one entry. The index is keyed on the entry, so every locale it holds
 * contributes: a write to one locale re-reads the rest rather than replacing
 * their references with its own.
 */
export async function syncEntryRelationships(
    config: ResolvedConfig,
    entry: { id: string },
    fields: JsonObject,
    type: string
): Promise<void> {
    const written = entryReferences(config, type, fields);
    if (written === null) return;

    // A custom-table type has no `entry_content` rows: its single row is the
    // whole entry, so the fields just written are all there is to index.
    const references = hasCustomTable(type)
        ? written
        : await storedEntryReferences(config, entry.id, type);

    await createRelationshipRepository().replaceForSource(
        { id: entry.id, kind: 'entry', type, staged: false },
        references
    );
}

/**
 * Every entry that could hold a relationship, with the references its stored
 * content holds: all types, all locales, trashed rows included. Never re-derive
 * from raw input — item ids are minted by `parseFields`.
 */
export async function allEntryRelationships(
    config: ResolvedConfig,
    options?: { type?: string }
): Promise<RelationshipIndexSource[]> {
    return [
        ...(await entriesTableEntrySources(config, options?.type)),
        ...(await customTableEntrySources(config, options?.type)),
    ];
}

/**
 * The references declared by `type`'s schema and held in `fields`, or null when
 * no such type is configured — the write seam skips those, the rebuild reports
 * them as a source holding nothing so their stale rows read as drift.
 */
function entryReferences(
    config: ResolvedConfig,
    type: string,
    fields: JsonObject
): FieldReference[] | null {
    const entryType = resolveEntryType(config, type);
    if (!entryType) return null;
    return findReferences(flattenEntryFields(entryType.fields), fields);
}

/**
 * The references every content row of one entry holds. Staged rows count: a
 * pending merge that references something is a reason not to delete it.
 */
async function storedEntryReferences(
    config: ResolvedConfig,
    entryId: string,
    type: string
): Promise<IndexedReference[]> {
    const rows = await createRepository(entryContentTable).findMany({
        where: { entryId },
    });
    return entryContentReferences(config, type, rows);
}

/**
 * An entry's references across its content rows, staged rows included, merged
 * by the shared rule. The write seam and the rebuild both call it.
 */
function entryContentReferences(
    config: ResolvedConfig,
    type: string,
    rows: readonly { fields: unknown; stagedFor: string | null }[]
): IndexedReference[] {
    return mergeContentReferences(
        rows,
        (fields) => entryReferences(config, type, fields) ?? []
    );
}

/**
 * Sources from the `entries` table, read directly rather than through
 * `repository.list()`: the list where-clause excludes staged rows unconditionally
 * and trashed rows by default, and the rebuild needs both.
 */
async function entriesTableEntrySources(
    config: ResolvedConfig,
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
        // source is never itself staged; the per-reference flag carries staging.
        source: { id: entry.id, kind: 'entry' as const, type: entry.type, staged: false },
        references: entryContentReferences(
            config,
            entry.type,
            rowsByEntry.get(entry.id) ?? []
        ),
    }));
}

/**
 * Sources for entry types backed by their own repository (`tableRepository`).
 * Their rows are not in the `entries` table but they are indexed on write, so
 * leaving them out would report every one of their references as drift.
 */
async function customTableEntrySources(
    config: ResolvedConfig,
    onlyType?: string
): Promise<RelationshipIndexSource[]> {
    const types = configuredEntryTypes(config)
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
                references: entryReferences(config, type, row.fields) ?? [],
            });
        }
    }
    return collected;
}

/** Every entry type id in the resolved config, the site's and each plugin's. */
function configuredEntryTypes(config: ResolvedConfig): string[] {
    return Object.keys(config.entryTypes);
}
