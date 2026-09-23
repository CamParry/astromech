/**
 * Queries and mutations for entries. `entryMutations(type)` is the table of
 * writes one type supports, each naming the keys it invalidates and its toasts;
 * `useAdminMutation` runs them.
 */

import type { EntryQueryParams } from 'astromech';
import { mutationOptions, queryOptions, useQuery } from '@tanstack/react-query';
import { AstromechApiError, astromechUntypedClient } from 'astromech/fetch';
import { queryKeys } from './use-query-keys';

/** One page of one entry type, keyed under `entries.all(type)` so every entry mutation refreshes it. */
export function entriesQueryOptions(params: EntryQueryParams & { type: string }) {
    return queryOptions({
        queryKey: queryKeys.entries.list(params.type, params),
        queryFn: () => astromechUntypedClient.entries.query(params),
    });
}

export function useEntriesQuery(params: EntryQueryParams & { type: string }) {
    return useQuery(entriesQueryOptions(params));
}

export function entryQueryOptions(type: string, id: string, locale: string) {
    const keys = queryKeys.entries;
    return queryOptions({
        queryKey: keys.get(type, id, locale),
        queryFn: () => astromechUntypedClient.entries.get({ type, id, locale }),
    });
}

export function entryVersionsQueryOptions(type: string, id: string, locale: string) {
    const keys = queryKeys.entries;
    return queryOptions({
        queryKey: keys.versions(type, id, locale),
        queryFn: () => astromechUntypedClient.entries.versions({ type, id, locale }),
    });
}

export function useEntry(type: string, id: string, locale: string) {
    return useQuery(entryQueryOptions(type, id, locale));
}

export function useEntryVersions(
    type: string,
    id: string,
    locale: string,
    enabled = true
) {
    return useQuery({ ...entryVersionsQueryOptions(type, id, locale), enabled });
}

/**
 * Read-only: every reference to `id`, from any resource. Used by the
 * delete-confirmation modal to warn about dangling references.
 */
export function useEntryUsage(type: string, id: string, enabled = true) {
    return useQuery({
        queryKey: queryKeys.entries.usedBy(type, id),
        queryFn: () => astromechUntypedClient.entries.usedBy({ type, id }),
        enabled,
    });
}

/** This locale's staged change, or null. */
export function useGetStaged(type: string, id: string, locale: string, enabled = true) {
    const keys = queryKeys.entries;
    return useQuery({
        queryKey: keys.staged(type, id, locale),
        queryFn: () => astromechUntypedClient.entries.getStaged({ type, id, locale }),
        enabled,
    });
}

/** Which locale of which entry a staging or version write addresses. */
type EntryLocale = { id: string; locale: string };

/**
 * Every write the admin makes to one entry type. Each invalidates the type's
 * keys, which hold its lists, rows, versions and staged changes. `name` is
 * what the toasts call the type.
 */
export function entryMutations(type: string, name: string = type) {
    const entries = astromechUntypedClient.entries;
    const all = queryKeys.entries.all(type);
    const invalidates = [all];
    const messageValues = { name };
    return {
        trash: mutationOptions({
            mutationKey: [...all, 'trash'],
            mutationFn: (id: string) => entries.trash({ type, id }),
            meta: {
                invalidates,
                successMessage: 'entries.movedToTrash',
                errorMessage: 'entries.deleteFailed',
                messageValues,
            },
        }),
        delete: mutationOptions({
            mutationKey: [...all, 'delete'],
            mutationFn: (id: string) => entries.delete({ type, id }),
            meta: {
                invalidates,
                successMessage: 'entries.permanentlyDeleted',
                errorMessage: 'entries.deleteFailed',
                messageValues,
            },
        }),
        duplicate: mutationOptions({
            mutationKey: [...all, 'duplicate'],
            mutationFn: (id: string) => entries.duplicate({ type, id }),
            meta: {
                invalidates,
                successMessage: 'entries.duplicated',
                errorMessage: 'entries.duplicateFailed',
                messageValues,
            },
        }),
        restore: mutationOptions({
            mutationKey: [...all, 'restore'],
            mutationFn: (id: string) => entries.restore({ type, id }),
            meta: {
                invalidates,
                successMessage: 'entries.restored',
                errorMessage: 'entries.restoreFailed',
                messageValues,
            },
        }),
        bulkTrash: mutationOptions({
            mutationKey: [...all, 'bulkTrash'],
            mutationFn: (ids: string[]) => entries.trash({ type, id: ids }),
            meta: {
                invalidates,
                successMessage: 'entries.bulkTrashed',
                errorMessage: 'entries.deleteFailed',
            },
        }),
        bulkDelete: mutationOptions({
            mutationKey: [...all, 'bulkDelete'],
            mutationFn: (ids: string[]) => entries.delete({ type, id: ids }),
            meta: {
                invalidates,
                successMessage: 'entries.bulkDeleted',
                errorMessage: 'entries.deleteFailed',
            },
        }),
        bulkRestore: mutationOptions({
            mutationKey: [...all, 'bulkRestore'],
            mutationFn: (ids: string[]) => entries.restore({ type, id: ids }),
            meta: {
                invalidates,
                successMessage: 'entries.bulkRestored',
                errorMessage: 'entries.restoreFailed',
            },
        }),
        bulkPublish: mutationOptions({
            mutationKey: [...all, 'bulkPublish'],
            mutationFn: (ids: string[]) => entries.publish({ type, id: ids }),
            meta: {
                invalidates,
                successMessage: 'entries.bulkPublished',
                errorMessage: 'entries.updateFailed',
            },
        }),
        bulkUnpublish: mutationOptions({
            mutationKey: [...all, 'bulkUnpublish'],
            mutationFn: (ids: string[]) => entries.unpublish({ type, id: ids }),
            meta: {
                invalidates,
                successMessage: 'entries.bulkUnpublished',
                errorMessage: 'entries.updateFailed',
            },
        }),
        restoreVersion: mutationOptions({
            mutationKey: [...all, 'restoreVersion'],
            mutationFn: ({
                id,
                locale,
                versionId,
            }: EntryLocale & { versionId: string }) =>
                entries.restoreVersion({ type, id, locale, versionId }),
            meta: {
                invalidates,
                successMessage: 'versions.restored',
                errorMessage: 'versions.restoreFailed',
            },
        }),
        /**
         * Add a locale to an entry. `update` on a locale with no content row
         * creates it from the default locale's shared fields, so an empty
         * patch is the whole request.
         */
        createTranslation: mutationOptions({
            mutationKey: [...all, 'createTranslation'],
            mutationFn: ({ id, locale }: EntryLocale) =>
                entries.update({ type, id, locale, data: {} }),
            meta: { invalidates, errorMessage: 'translations.createFailed' },
        }),
        /**
         * Stage a change on one locale. A staged change that already exists
         * resolves as `null`: it shares the entry's id, so the caller opens it.
         */
        createStaged: mutationOptions({
            mutationKey: [...all, 'createStaged'],
            mutationFn: ({ id, locale }: EntryLocale) =>
                entries.createStaged({ type, id, locale }).catch(openExisting),
            meta: { invalidates, errorMessage: 'staging.stageFailed' },
        }),
        mergeStaged: mutationOptions({
            mutationKey: [...all, 'mergeStaged'],
            mutationFn: ({ id, locale }: EntryLocale) =>
                entries.mergeStaged({ type, id, locale }),
            meta: {
                invalidates,
                successMessage: 'staging.merged',
                errorMessage: 'staging.mergeFailed',
            },
        }),
        deleteStaged: mutationOptions({
            mutationKey: [...all, 'deleteStaged'],
            mutationFn: ({ id, locale }: EntryLocale) =>
                entries.deleteStaged({ type, id, locale }),
            meta: {
                invalidates,
                successMessage: 'staging.discarded',
                errorMessage: 'staging.discardFailed',
            },
        }),
        /** A preview token for one entry; the plaintext token comes back once. */
        issuePreviewToken: mutationOptions({
            mutationKey: [...all, 'issuePreviewToken'],
            mutationFn: (id: string) => entries.issuePreviewToken({ type, id }),
            meta: { invalidates: [], errorMessage: 'staging.previewFailed' },
        }),
        revokePreviewToken: mutationOptions({
            mutationKey: [...all, 'revokePreviewToken'],
            mutationFn: (id: string) => entries.revokePreviewToken({ type, id }),
            meta: {
                invalidates: [],
                successMessage: 'staging.previewRevoked',
                errorMessage: 'staging.previewFailed',
            },
        }),
    };
}

/** Resolve a create-staged conflict as `null`, and rethrow anything else. */
export function openExisting(error: unknown): null {
    if (error instanceof AstromechApiError && error.code === 'staged_change_exists') {
        return null;
    }
    throw error;
}
