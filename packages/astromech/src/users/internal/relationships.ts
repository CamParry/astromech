/**
 * Relationship indexing (users policy): the users tables bound to the shared
 * content policy in `content/relationships.ts`, which holds the rule.
 */

import { createContentRelationships } from '@/content/relationships';
import { RESOURCE_SPECS } from '@/content/resources';
import { getUserRepository } from '@/users/repository';

const relationships = createContentRelationships({
    repository: getUserRepository,
    ownerColumn: 'userId',
    kind: 'user',
    fields: (config) => RESOURCE_SPECS.user.fields(config),
});

/**
 * Replace one user's rows in the index with the references every locale of
 * their stored profile holds. Call it inside the transaction that wrote the
 * row, after that write, so the re-read sees it.
 */
export const syncUserRelationships = relationships.sync;

/**
 * Every user as a relationship source, with the references its stored content
 * holds. The rebuild side of `syncUserRelationships`.
 */
export const allUserRelationships = relationships.all;
