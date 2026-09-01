/**
 * Entries service — the entry CRUD verbs, reached as `app.entries`. A thin
 * assembler: it wires `operations/**` into the public `EntriesService` object,
 * and every policy lives there or in `internal/**`.
 */

import type { EntriesService, EntryUpdateParams } from '@/types/index';
import { BulkOperationError } from './errors';
import { createEntry } from './operations/create';
import { deleteEntries } from './operations/delete';
import { duplicateEntry } from './operations/duplicate';
import { getEntry } from './operations/get';
import { issuePreviewToken, revokePreviewToken } from './operations/preview/token';
import { queryEntries } from './operations/query';
import { listIncomingRelationships } from './operations/relationships';
import { restoreEntries } from './operations/restore';
import { createStagedEntry } from './operations/staging/create';
import { deleteStagedEntry } from './operations/staging/delete';
import { getStagedEntry } from './operations/staging/get';
import { mergeStagedEntry } from './operations/staging/merge';
import { publishEntries, scheduleEntries, unpublishEntries } from './operations/status';
import { emptyTrash, trashEntries } from './operations/trash';
import { updateEntries } from './operations/update';
import { listEntryVersions } from './operations/versions/list';
import { restoreEntryVersion } from './operations/versions/restore';

export const entriesService: EntriesService = {
    query: queryEntries,
    get: getEntry,
    create: createEntry,
    // `update`, `trash`, `restore`, `delete`, `publish`, `unpublish` and
    // `schedule` adapt the `string | readonly string[]` overloads onto the
    // batch-only operations (`DECISIONS.md`).
    update: ((params: EntryUpdateParams) => {
        const many = Array.isArray(params.id);
        return updateEntries({
            type: params.type,
            ids: [params.id].flat(),
            ...(params.locale !== undefined ? { locale: params.locale } : {}),
            ...(params.staged !== undefined ? { staged: params.staged } : {}),
            data: params.data,
        })
            .then((rows) => (many ? rows : rows[0]))
            .catch((err: unknown) => {
                throw many ? err : unwrapBatchOfOne(err);
            });
    }) as EntriesService['update'],
    duplicate: duplicateEntry,
    trash: (params) => {
        const many = Array.isArray(params.id);
        return trashEntries({ type: params.type, ids: [params.id].flat() }).catch(
            (err: unknown) => {
                throw many ? err : unwrapBatchOfOne(err);
            }
        );
    },
    restore: ((params: { type: string; id: string | readonly string[] }) => {
        const many = Array.isArray(params.id);
        return restoreEntries({ type: params.type, ids: [params.id].flat() })
            .then((rows) => (many ? rows : rows[0]))
            .catch((err: unknown) => {
                throw many ? err : unwrapBatchOfOne(err);
            });
    }) as EntriesService['restore'],
    delete: (params) => {
        const many = Array.isArray(params.id);
        return deleteEntries({ type: params.type, ids: [params.id].flat() }).catch(
            (err: unknown) => {
                throw many ? err : unwrapBatchOfOne(err);
            }
        );
    },
    emptyTrash,
    versions: listEntryVersions,
    restoreVersion: restoreEntryVersion,
    publish: ((params: {
        type: string;
        id: string | readonly string[];
        locale?: string;
    }) => {
        const many = Array.isArray(params.id);
        return publishEntries({
            type: params.type,
            ids: [params.id].flat(),
            ...(params.locale !== undefined ? { locale: params.locale } : {}),
        })
            .then((rows) => (many ? rows : rows[0]))
            .catch((err: unknown) => {
                throw many ? err : unwrapBatchOfOne(err);
            });
    }) as EntriesService['publish'],
    unpublish: ((params: {
        type: string;
        id: string | readonly string[];
        locale?: string;
    }) => {
        const many = Array.isArray(params.id);
        return unpublishEntries({
            type: params.type,
            ids: [params.id].flat(),
            ...(params.locale !== undefined ? { locale: params.locale } : {}),
        })
            .then((rows) => (many ? rows : rows[0]))
            .catch((err: unknown) => {
                throw many ? err : unwrapBatchOfOne(err);
            });
    }) as EntriesService['unpublish'],
    schedule: ((params: {
        type: string;
        id: string | readonly string[];
        publishedAt: Date;
        locale?: string;
    }) => {
        const many = Array.isArray(params.id);
        return scheduleEntries({
            type: params.type,
            ids: [params.id].flat(),
            publishedAt: params.publishedAt,
            ...(params.locale !== undefined ? { locale: params.locale } : {}),
        })
            .then((rows) => (many ? rows : rows[0]))
            .catch((err: unknown) => {
                throw many ? err : unwrapBatchOfOne(err);
            });
    }) as EntriesService['schedule'],
    incomingRelationships: listIncomingRelationships,
    createStaged: createStagedEntry,
    getStaged: getStagedEntry,
    mergeStaged: mergeStagedEntry,
    deleteStaged: deleteStagedEntry,
    issuePreviewToken,
    revokePreviewToken,
};

/**
 * For a batch of one the `BulkOperationError` envelope names nothing the caller
 * does not already know, so the single-id overloads hand back the underlying
 * error (a `ValidationError` stays a `ValidationError`).
 */
function unwrapBatchOfOne(err: unknown): unknown {
    return err instanceof BulkOperationError ? (err.cause ?? err) : err;
}
