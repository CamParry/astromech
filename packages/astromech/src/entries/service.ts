/**
 * Astromech Server Entries API.
 *
 * Thin assembler: wires the per-operation functions in `operations/**` into the
 * public `EntriesApi` object. All policy (validation, hooks, relationships,
 * versioning/staging, slug, supports gating, bulk dispatch) lives in
 * `operations/**` + `internal/**`; persistence flows through the storage seam.
 * Import from 'astromech/local'.
 */

import { setCurrentUser } from '@/context/index.js';
import type { EntriesApi, User } from '@/types/index.js';
import { query } from './operations/query.js';
import { get } from './operations/get.js';
import { create } from './operations/create.js';
import { update } from './operations/update.js';
import { duplicate } from './operations/duplicate.js';
import { trash, emptyTrash } from './operations/trash.js';
import { restore } from './operations/restore.js';
import { deleteEntry } from './operations/delete.js';
import { publish, unpublish, schedule } from './operations/status.js';
import { incomingRelations } from './operations/relations.js';
import { listVersions } from './operations/versions/list.js';
import { restoreVersion } from './operations/versions/restore.js';
import { createStaged } from './operations/staging/create.js';
import { getStaged } from './operations/staging/get.js';
import { mergeStaged } from './operations/staging/merge.js';
import { deleteStaged } from './operations/staging/delete.js';
import { issuePreviewToken, revokePreviewToken } from './operations/preview/token.js';

/** @deprecated Slug uniqueness is now a storage concern. */
export { generateUniqueSlug } from './internal/slug.js';

/**
 * @deprecated Use setCurrentUser from @/context/index.js instead.
 */
export function initServerContext(ctx: {
    db: unknown;
    config: unknown;
    user: User | null;
}): void {
    setCurrentUser(ctx.user);
}

export const entries: EntriesApi = {
    query,
    get,
    create,
    update: update as EntriesApi['update'],
    duplicate,
    trash,
    restore: restore as EntriesApi['restore'],
    delete: deleteEntry,
    emptyTrash,
    versions: listVersions,
    restoreVersion,
    publish: publish as EntriesApi['publish'],
    unpublish: unpublish as EntriesApi['unpublish'],
    schedule: schedule as EntriesApi['schedule'],
    incomingRelations,
    createStaged,
    getStaged,
    mergeStaged,
    deleteStaged,
    issuePreviewToken,
    revokePreviewToken,
};
