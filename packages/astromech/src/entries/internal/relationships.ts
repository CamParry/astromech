/**
 * Relationship indexing (entries policy): derive an entry's edges from the field
 * data just written and replace its rows in the index. An optional `db` scopes
 * the write to a transaction.
 */

import config from 'virtual:astromech/config';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { collectRelationshipEdges } from '@/fields/relationship-edges.js';
import { flattenEntryFields } from '@/fields/helpers.js';
import { resolveEntryType } from '../type-registry.js';
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
    const entryTypeConfig = resolveEntryType(config, typeName);
    if (!entryTypeConfig) return;

    const definitions = flattenEntryFields(entryTypeConfig.fields);
    const edges = collectRelationshipEdges(definitions, fields);
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
