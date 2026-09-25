/**
 * Relationship indexing (entries policy): derive an entry's references from the
 * content it now holds and replace its rows in the index, plus the rebuild-side
 * collector that enumerates every entry as a source.
 */

import type {
    IndexedReference,
    RelationshipIndexSource,
} from '@/content/repository/relationships';
import type { FieldReference } from '@/fields/references';
import type { JsonObject, ResolvedConfig } from '@/types/index';
import { mergeContentReferences } from '@/content/relationships';
import { relationshipRepository } from '@/content/repository/relationships';
import { resolveEntryType } from '@/entries/entry-types';
import { flattenEntryFields } from '@/fields/flatten';
import { findReferences } from '@/fields/references';
import { entryRepository } from '../repository/entries-table';

/**
 * Re-index one entry from its stored rows. The index is keyed on the entry, so
 * every locale it holds contributes: a write to one locale re-reads the rest
 * rather than replacing their references with its own.
 */
export async function syncEntryRelationships(
    config: ResolvedConfig,
    entry: { id: string },
    type: string
): Promise<void> {
    // An unconfigured type has no schema to read references from.
    if (!resolveEntryType(config, type)) return;

    await relationshipRepository.replaceForSource(
        { id: entry.id, kind: 'entry', type, staged: false },
        await storedEntryReferences(config, entry.id, type)
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
    const type = options?.type;
    const entries = await entryRepository.findEntryRowsByType(type);
    const contents = await entryRepository.findContentRowsByType(type);

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
    const rows = await entryRepository.findContentRowsByEntry(entryId);
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
