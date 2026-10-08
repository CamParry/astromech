/**
 * Relationship indexing (entries policy): the entries tables bound to the shared
 * content policy in `content/relationships.ts`, which holds the rule. An entry's
 * type is the index's `sourceType`, and the schema its references are read from.
 */

import type { ResolvedConfig } from '@/types/index';
import { createContentRelationships } from '@/content/relationships';
import { resolveEntryType } from '@/entries/entry-types';
import { entryRepository } from './repository/entries-table';

const relationships = createContentRelationships({
    repository: entryRepository,
    resourceIdColumn: 'entryId',
    kind: 'entry',
    sourceType: (resourceRow) => String(resourceRow['type']),
});

/**
 * Replace one entry's rows in the index with the references every locale of its
 * stored content holds, staged rows included. Call it inside the transaction
 * that wrote the row, after that write, so the re-read sees it. An entry of a
 * type no longer configured keeps its rows: there is no schema to read
 * references from, and the rebuild reports them as drift.
 */
export async function syncEntryRelationships(
    config: ResolvedConfig,
    entry: { id: string; type: string }
): Promise<void> {
    if (!resolveEntryType(config, entry.type)) return;
    await relationships.sync(config, entry.id);
}

/**
 * Every entry as a relationship source, with the references its stored content
 * holds: all types, all locales, trashed rows included; of one type when `type`
 * is given. An entry of a type no longer configured is a source holding
 * nothing, so its stale rows read as drift. The rebuild side of
 * `syncEntryRelationships`.
 */
export const allEntryRelationships = relationships.all;
