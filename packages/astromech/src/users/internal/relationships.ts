/**
 * Relationship indexing (users policy): derive a user's edges from the field
 * data just written and replace its rows in the index, plus the rebuild-side
 * collector that enumerates every user as a source.
 */

import { getConfig } from '@/config/registry';
import { createRelationshipStorage } from '@/database/storage/relationships';
import type { RelationshipIndexSource } from '@/database/storage/relationships';
import { collectRelationshipEdges } from '@/fields/relationship-edges';
import { flattenFieldNodes } from '@/fields/flatten';
import type { JsonObject } from '@/types/index';
import { createUserStorage } from '../storage';

/**
 * Re-index a user's relationship fields. `fields` must be post-`parseFields`
 * values — item ids are minted during that pass.
 */
export async function indexUserRelationships(
    id: string,
    fields: JsonObject
): Promise<void> {
    const definitions = flattenFieldNodes(getConfig().users?.fields ?? []);
    await createRelationshipStorage().replaceForSource(
        { id, kind: 'user' },
        collectRelationshipEdges(definitions, fields)
    );
}

/**
 * Every user as a relationship source, with the edges its STORED field data
 * holds. The rebuild side of `indexUserRelationships`. Stored data has already
 * been through `parseFields`, so the traversal mints no ids here.
 */
export async function collectUserRelationshipSources(): Promise<
    RelationshipIndexSource[]
> {
    const definitions = flattenFieldNodes(getConfig().users?.fields ?? []);
    const rows = await createUserStorage().list();
    return rows.map((row) => ({
        source: { id: row.id, kind: 'user' as const },
        edges: collectRelationshipEdges(
            definitions,
            (row.fields ?? {}) as unknown as JsonObject
        ),
    }));
}
