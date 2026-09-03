/**
 * Relationship indexing (media policy): derive a media item's edges from every
 * locale's stored content and replace its rows in the index, plus the
 * rebuild-side collector that enumerates every media item as a source.
 */

import type { RelationshipIndexSource } from '@/database/repository/relationships';
import type { RelationshipEdge } from '@/fields/relationship-edges';
import type { JsonObject } from '@/types/index';
import { getConfig } from '@/config/registry';
import { createRepository } from '@/database/repository/create-repository';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { mediaContentTable, mediaTable } from '@/database/tables';
import { flattenFieldNodes } from '@/fields/flatten';
import { collectRelationshipEdges } from '@/fields/relationship-edges';

/**
 * Re-index one media item. The index is keyed on the item, so every locale it
 * holds contributes: a write to one locale re-reads the rest rather than
 * replacing their edges with its own. Call it inside the transaction that wrote
 * the row, after that write, so the re-read sees it.
 */
export async function indexMediaRelationships(id: string): Promise<void> {
    const rows = await createRepository(mediaContentTable).findMany({
        where: { mediaId: id },
    });
    await createRelationshipRepository().replaceForSource(
        { id, kind: 'media' },
        mediaContentEdges(rows)
    );
}

/**
 * Every media item as a relationship source, with the edges its STORED content
 * holds across all locales. The rebuild side of `indexMediaRelationships`, read
 * straight from the tables rather than through `repository.list()`, whose join
 * is pinned to the default locale. Stored data has already been through
 * `parseFields`, so the traversal mints no ids here.
 */
export async function collectMediaRelationshipSources(): Promise<
    RelationshipIndexSource[]
> {
    const items = await createRepository(mediaTable).findMany({});
    const contents = await createRepository(mediaContentTable).findMany({});

    const rowsByMedia = new Map<string, typeof contents>();
    for (const row of contents) {
        const held = rowsByMedia.get(row.mediaId);
        if (held) held.push(row);
        else rowsByMedia.set(row.mediaId, [row]);
    }

    return items.map((item) => ({
        source: { id: item.id, kind: 'media' as const },
        edges: mediaContentEdges(rowsByMedia.get(item.id) ?? []),
    }));
}

/**
 * One edge per (instancePath, target) across a media item's content rows: two
 * locales holding the same reference are one row, and the index's primary key
 * would reject the second. Media has no staging, so every edge is canonical.
 *
 * The one place the rule lives — the write seam and the rebuild both call it.
 */
function mediaContentEdges(rows: readonly { fields: unknown }[]): RelationshipEdge[] {
    const definitions = flattenFieldNodes(getConfig().media?.fields ?? []);
    const byKey = new Map<string, RelationshipEdge>();
    for (const row of rows) {
        const fields = (row.fields ?? {}) as JsonObject;
        for (const edge of collectRelationshipEdges(definitions, fields)) {
            byKey.set(`${edge.instancePath}\0${edge.targetKind}\0${edge.targetId}`, edge);
        }
    }
    return Array.from(byKey.values());
}
