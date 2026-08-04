/**
 * Entries service — the entry CRUD verbs.
 *
 * Thin assembler: wires the per-operation functions in `operations/**` into the
 * public `EntriesService` object. All policy (validation, hooks, relationships,
 * versioning/staging, slug, capability gating, bulk dispatch) lives in
 * `operations/**` + `internal/**`; persistence flows through the storage seam.
 * Import from 'astromech/local'.
 */

import type { EntriesService } from '@/types/index.js';
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

export const entriesService: EntriesService = {
    query,
    get,
    create,
    update: update as EntriesService['update'],
    duplicate,
    trash,
    restore: restore as EntriesService['restore'],
    delete: deleteEntry,
    emptyTrash,
    versions: listVersions,
    restoreVersion,
    publish: publish as EntriesService['publish'],
    unpublish: unpublish as EntriesService['unpublish'],
    schedule: schedule as EntriesService['schedule'],
    incomingRelations,
    createStaged,
    getStaged,
    mergeStaged,
    deleteStaged,
    issuePreviewToken,
    revokePreviewToken,
};
