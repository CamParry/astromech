/**
 * Entries service — the entry CRUD verbs.
 *
 * Thin assembler: wires the per-operation functions in `operations/**` into the
 * public `EntriesService` object. All policy (validation, hooks, relationships,
 * versioning/staging, slug, capability gating, bulk dispatch) lives in
 * `operations/**` + `internal/**`; persistence flows through the storage seam.
 * Consumers reach it as `app.entries`.
 */

import type { EntriesService } from '@/types/index';
import { query } from './operations/query';
import { get } from './operations/get';
import { create } from './operations/create';
import { update } from './operations/update';
import { duplicate } from './operations/duplicate';
import { trash, emptyTrash } from './operations/trash';
import { restore } from './operations/restore';
import { deleteEntry } from './operations/delete';
import { publish, unpublish, schedule } from './operations/status';
import { incomingRelationships } from './operations/relationships';
import { listVersions } from './operations/versions/list';
import { restoreVersion } from './operations/versions/restore';
import { createStaged } from './operations/staging/create';
import { getStaged } from './operations/staging/get';
import { mergeStaged } from './operations/staging/merge';
import { deleteStaged } from './operations/staging/delete';
import { issuePreviewToken, revokePreviewToken } from './operations/preview/token';

/** @deprecated Slug uniqueness is now a storage concern. */
export { generateUniqueSlug } from './internal/slug';

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
    incomingRelationships,
    createStaged,
    getStaged,
    mergeStaged,
    deleteStaged,
    issuePreviewToken,
    revokePreviewToken,
};
