/**
 * Entries service — the entry CRUD verbs, reached as `app.entries`. A thin
 * assembler: it wires `operations/**` into the public `EntriesService` object,
 * and every policy lives there or in `internal/**`.
 */

import type { EntriesService } from '@/types/index';
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
    update: fromBatch(updateEntries) as EntriesService['update'],
    duplicate: duplicateEntry,
    trash: fromBatch(trashEntries),
    restore: fromBatch(restoreEntries) as EntriesService['restore'],
    delete: fromBatch(deleteEntries),
    emptyTrash,
    versions: listEntryVersions,
    restoreVersion: restoreEntryVersion,
    publish: fromBatch(publishEntries) as EntriesService['publish'],
    unpublish: fromBatch(unpublishEntries) as EntriesService['unpublish'],
    schedule: fromBatch(scheduleEntries) as EntriesService['schedule'],
    incomingRelationships: listIncomingRelationships,
    createStaged: createStagedEntry,
    getStaged: getStagedEntry,
    mergeStaged: mergeStagedEntry,
    deleteStaged: deleteStagedEntry,
    issuePreviewToken,
    revokePreviewToken,
};

/**
 * Adapts a batch-only operation onto the `id: string | readonly string[]`
 * overload: one id is a batch of one, and its result and errors are unwrapped.
 */
function fromBatch<B extends { ids: readonly string[] }>(
    operation: (params: B) => Promise<void>
): (params: Omit<B, 'ids'> & { id: string | readonly string[] }) => Promise<void>;
function fromBatch<B extends { ids: readonly string[] }, R>(
    operation: (params: B) => Promise<R[]>
): (params: Omit<B, 'ids'> & { id: string | readonly string[] }) => Promise<R | R[]>;
function fromBatch<B extends { ids: readonly string[] }, R>(
    operation: (params: B) => Promise<R[] | void>
) {
    return async (params: Omit<B, 'ids'> & { id: string | readonly string[] }) => {
        const { id, ...rest } = params;
        const many = Array.isArray(id);
        try {
            const rows = await operation({ ...rest, ids: [id].flat() } as unknown as B);
            return many ? rows : rows?.[0];
        } catch (err: unknown) {
            throw many ? err : unwrapBatchOfOne(err);
        }
    };
}

/**
 * For a batch of one the `BulkOperationError` envelope names nothing the caller
 * does not already know, so the single-id overloads hand back the underlying
 * error (a `ValidationError` stays a `ValidationError`).
 */
function unwrapBatchOfOne(err: unknown): unknown {
    return err instanceof BulkOperationError ? (err.cause ?? err) : err;
}
