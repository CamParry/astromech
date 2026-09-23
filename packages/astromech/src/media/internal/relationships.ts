/**
 * Relationship indexing (media policy): the media tables bound to the shared
 * content policy in `content/relationships.ts`, which holds the rule.
 */

import { createContentRelationships } from '@/content/relationships';
import { RESOURCE_SPECS } from '@/content/resources';
import { mediaContentTable, mediaTable } from '@/database/tables';

const relationships = createContentRelationships({
    table: mediaTable,
    contentTable: mediaContentTable,
    ownerColumn: 'mediaId',
    kind: 'media',
    fields: (config) => RESOURCE_SPECS.media.fields(config),
});

/**
 * Replace one media item's rows in the index with the references every locale
 * of its stored content holds. Call it inside the transaction that wrote the
 * row, after that write, so the re-read sees it.
 */
export const syncMediaRelationships = relationships.sync;

/**
 * Every media item as a relationship source, with the references its stored
 * content holds. The rebuild side of `syncMediaRelationships`.
 */
export const allMediaRelationships = relationships.all;
