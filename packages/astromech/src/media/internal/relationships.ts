/**
 * Relationship indexing (media policy): derive a media record's edges from the
 * field data just written and replace its rows in the index, plus the
 * rebuild-side collector that enumerates every media record as a source.
 */

import { getConfig } from '@/config/registry';
import { createRelationshipStorage } from '@/database/storage/relationships';
import type { RelationshipIndexSource } from '@/database/storage/relationships';
import { collectRelationshipEdges } from '@/fields/relationship-edges';
import { flattenFieldNodes } from '@/fields/flatten';
import type { JsonObject } from '@/types/index';
import { createMediaStorage } from '../storage';

/**
 * Re-index a media record's relationship fields. `fields` must be
 * post-`processFields` values — item ids are minted during that pass.
 */
export async function indexMediaRelationships(
    id: string,
    fields: JsonObject
): Promise<void> {
    const definitions = flattenFieldNodes(getConfig().media?.fields ?? []);
    await createRelationshipStorage().replaceForSource(
        { id, kind: 'media' },
        collectRelationshipEdges(definitions, fields)
    );
}

/**
 * Every media record as a relationship source, with the edges its STORED field
 * data holds. The rebuild side of `indexMediaRelationships`. Stored data has
 * already been through `processFields`, so the traversal mints no ids here.
 */
export async function collectMediaRelationshipSources(): Promise<
    RelationshipIndexSource[]
> {
    const definitions = flattenFieldNodes(getConfig().media?.fields ?? []);
    const rows = await createMediaStorage().list();
    return rows.map((row) => ({
        source: { id: row.id, kind: 'media' as const },
        edges: collectRelationshipEdges(definitions, (row.fields ?? {}) as JsonObject),
    }));
}
