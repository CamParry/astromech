/**
 * Relationship indexing (globals policy): the globals tables bound to the shared
 * content policy in `content/relationships.ts`, which holds the rule. A global's
 * key is the index's `sourceType`, so a reverse lookup can name it.
 */

import { createContentRelationships } from '@/content/relationships';
import { RESOURCE_SPECS } from '@/content/resources';
import { globalRepository } from '@/globals/repository';

const relationships = createContentRelationships({
    repository: globalRepository,
    ownerColumn: 'globalId',
    kind: 'global',
    // A global no longer declared has no fields, so it holds no references.
    fields: (config, owner) => RESOURCE_SPECS.global.fields(config, String(owner['key'])),
    sourceType: (owner) => String(owner['key']),
});

/**
 * Replace one global's rows in the index with the references every locale of
 * its stored content holds, staged rows included. Call it inside the
 * transaction that wrote the row, after that write, so the re-read sees it.
 */
export const syncGlobalRelationships = relationships.sync;

/**
 * Every saved global as a relationship source, with the references its stored
 * content holds. The rebuild side of `syncGlobalRelationships`.
 */
export const allGlobalRelationships = relationships.all;
