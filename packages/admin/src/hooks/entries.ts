/**
 * Queries and mutations for entries. `entryMutations(type)` is the table of
 * writes one type supports, each naming the keys it invalidates and its toasts;
 * `useAdminMutation` runs them.
 */

import type { UseMutationResult } from '@tanstack/react-query';
import type { EntryQueryParams } from 'astromech';
import { mutationOptions, queryOptions, useQuery } from '@tanstack/react-query';
import { AstromechApiError, astromechUntypedClient } from 'astromech/fetch';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/ui/toast';
import { useAdminMutation } from './use-admin-mutation';
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
    return queryOptions({
        queryKey: queryKeys.entries.get(type, id, locale),
        queryFn: () => astromechUntypedClient.entries.get({ type, id, locale }),
    });
}

export function entryVersionsQueryOptions(type: string, id: string, locale: string) {
    return queryOptions({
        queryKey: queryKeys.entries.versions(type, id, locale),
        queryFn: () => astromechUntypedClient.entries.versions({ type, id, locale }),
    });
}

/** One saved version of one locale of an entry, with its snapshot. */
export function entryVersionQueryOptions(
    type: string,
    id: string,
    locale: string,
    version: number
) {
    return queryOptions({
        queryKey: queryKeys.entries.version(type, id, locale, version),
        queryFn: () =>
            astromechUntypedClient.entries.getVersion({ type, id, locale, version }),
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
        /** Resolves with the slugs the restore changed; `useRestoreEntries` toasts. */
        restore: mutationOptions({
            mutationKey: [...all, 'restore'],
            mutationFn: (id: string) => restoreEntries(type, [id]),
            meta: { invalidates, errorMessage: 'entries.restoreFailed', messageValues },
        }),
        bulkTrash: mutationOptions({
            mutationKey: [...all, 'bulkTrash'],
            mutationFn: (ids: string[]) => entries.trash({ type, ids }),
            meta: {
                invalidates,
                successMessage: 'entries.bulkTrashed',
                errorMessage: 'entries.deleteFailed',
            },
        }),
        bulkDelete: mutationOptions({
            mutationKey: [...all, 'bulkDelete'],
            mutationFn: (ids: string[]) => entries.delete({ type, ids }),
            meta: {
                invalidates,
                successMessage: 'entries.bulkDeleted',
                errorMessage: 'entries.deleteFailed',
            },
        }),
        bulkRestore: mutationOptions({
            mutationKey: [...all, 'bulkRestore'],
            mutationFn: (ids: string[]) => restoreEntries(type, ids),
            meta: { invalidates, errorMessage: 'entries.restoreFailed' },
        }),
        bulkPublish: mutationOptions({
            mutationKey: [...all, 'bulkPublish'],
            mutationFn: (ids: string[]) => entries.publish({ type, ids }),
            meta: {
                invalidates,
                successMessage: 'entries.bulkPublished',
                errorMessage: 'entries.updateFailed',
            },
        }),
        bulkUnpublish: mutationOptions({
            mutationKey: [...all, 'bulkUnpublish'],
            mutationFn: (ids: string[]) => entries.unpublish({ type, ids }),
            meta: {
                invalidates,
                successMessage: 'entries.bulkUnpublished',
                errorMessage: 'entries.updateFailed',
            },
        }),
        restoreVersion: mutationOptions({
            mutationKey: [...all, 'restoreVersion'],
            mutationFn: ({ id, locale, version }: EntryLocale & { version: number }) =>
                entries.restoreVersion({ type, id, locale, version }),
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

/** A locale whose slug a restore changed, because another entry took the old one. */
type ChangedSlug = { locale: string; slug: string | null };

/**
 * Restore `ids` in one request, and answer the slugs that changed in any locale,
 * read from every locale of each entry before and after.
 */
async function restoreEntries(type: string, ids: string[]): Promise<ChangedSlug[]> {
    const entries = astromechUntypedClient.entries;
    // One read per id: a list of ids has no query-string form.
    const read = (trashed: boolean) =>
        Promise.all(
            ids.map((id) =>
                entries.query({
                    type,
                    where: { id },
                    locale: 'all',
                    limit: 'all',
                    full: true,
                    trashed,
                })
            )
        );
    const before = new Map(
        (await read(true))
            .flatMap((page) => page.data)
            .map((entry) => [`${entry.id}:${entry.locale}`, entry.slug])
    );
    await entries.restore({ type, ids });
    return (await read(false))
        .flatMap((page) => page.data)
        .filter((entry) => {
            const key = `${entry.id}:${entry.locale}`;
            return before.has(key) && before.get(key) !== entry.slug;
        })
        .map(({ locale, slug }) => ({ locale, slug }));
}

/**
 * Restore one entry (`restore`) or a selection (`bulkRestore`), and toast the
 * result: unpublished when the type has statuses, and every slug that changed
 * because another entry took the old one while the entry was in the trash.
 */
export function useRestoreEntries(
    type: string,
    options: { name: string; statuses: boolean; translatable: boolean }
): {
    restore: UseMutationResult<ChangedSlug[], Error, string>;
    bulkRestore: UseMutationResult<ChangedSlug[], Error, string[]>;
} {
    const { name, statuses, translatable } = options;
    const { toast } = useToast();
    const { t } = useTranslation();
    const mutations = entryMutations(type, name);

    function report(changed: ChangedSlug[], bulk: boolean): void {
        const restored = bulk
            ? t(statuses ? 'entries.bulkRestoredUnpublished' : 'entries.bulkRestored')
            : t(statuses ? 'entries.restoredUnpublished' : 'entries.restored', { name });
        const slugs = changed
            .map(({ locale, slug }) => (translatable ? `${slug} (${locale})` : slug))
            .join(', ');
        toast({
            message:
                changed.length === 0
                    ? restored
                    : `${restored} ${t('entries.restoredNewSlugs', { count: changed.length, slugs })}`,
            variant: 'success',
        });
    }

    return {
        restore: useAdminMutation(mutations.restore, {
            onSuccess: (changed) => report(changed, false),
        }),
        bulkRestore: useAdminMutation(mutations.bulkRestore, {
            onSuccess: (changed) => report(changed, true),
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
