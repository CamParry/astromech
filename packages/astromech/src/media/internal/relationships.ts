/**
 * Relationship indexing (media policy): derive a media record's edges from the
 * field data just written and replace its rows in the index, plus the
 * rebuild-side collector that enumerates every media record as a source.
 */

import type { RelationshipIndexSource } from '@/database/repository/relationships';
import type { JsonObject } from '@/types/index';
import { getConfig } from '@/config/registry';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { flattenFieldNodes } from '@/fields/flatten';
import { collectRelationshipEdges } from '@/fields/relationship-edges';
import { createMediaRepository } from '../repository';

/**
 * Re-index a media record's relationship fields. `fields` must be
 * post-`parseFields` values — item ids are minted during that pass.
 */
export async function indexMediaRelationships(
    id: string,
    fields: JsonObject
): Promise<void> {
    const definitions = flattenFieldNodes(getConfig().media?.fields ?? []);
    await createRelationshipRepository().replaceForSource(
        { id, kind: 'media' },
        collectRelationshipEdges(definitions, fields)
    );
}

/**
 * Every media record as a relationship source, with the edges its STORED field
 * data holds. The rebuild side of `indexMediaRelationships`. Stored data has
 * already been through `parseFields`, so the traversal mints no ids here.
 */
export async function collectMediaRelationshipSources(): Promise<
    RelationshipIndexSource[]
> {
    const definitions = flattenFieldNodes(getConfig().media?.fields ?? []);
    const rows = await createMediaRepository().list();
    return rows.map((row) => ({
        source: { id: row.id, kind: 'media' as const },
        edges: collectRelationshipEdges(definitions, (row.fields ?? {}) as JsonObject),
    }));
}
