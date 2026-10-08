/**
 * Queries and mutations for entries. `entryMutations(type)` is the table of
 * writes one type supports, each naming the keys it invalidates and its toasts;
 * `useAdminMutation` runs them.
 */

import type { UseMutationResult } from '@tanstack/react-query';
import type {
    Entry,
    EntryCreateData,
    EntryQueryParams,
    EntryUpdateData,
} from 'astromech';
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

/** How many entries each of `types` holds, keyed by type, in one request. */
export function entryCountsQueryOptions(types: readonly string[]) {
    return queryOptions({
        queryKey: queryKeys.entries.counts(types),
        queryFn: () => astromechUntypedClient.entries.count({ type: [...types] }),
        enabled: types.length > 0,
    });
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
 * keys, which hold its lists, rows, versions and staged changes, and the
 * dashboard's counts. `name` is
 * what the toasts call the type.
 */
export function entryMutations(type: string, name: string = type) {
    const entries = astromechUntypedClient.entries;
    const all = queryKeys.entries.all(type);
    const invalidates = [all, queryKeys.entries.counts()];
    const messageValues = { name };
    return {
        create: mutationOptions({
            mutationKey: [...all, 'create'],
            mutationFn: (data: EntryCreateData) => entries.create({ type, data }),
            meta: {
                invalidates,
                successMessage: 'entries.created',
                errorMessage: 'entries.createFailed',
                messageValues,
            },
        }),
        /**
         * Save one locale, or its staged change when `staged` is true. The
         * saved row is written to its key before the invalidation, so a form
         * that resets to it never re-renders from the stale cached row.
         */
        update: mutationOptions({
            mutationKey: [...all, 'update'],
            mutationFn: async (
                {
                    id,
                    locale,
                    staged,
                    data,
                }: EntryLocale & { staged: boolean; data: EntryUpdateData },
                { client }
            ) => {
                const saved = await entries.update({ type, id, locale, staged, data });
                client.setQueryData(
                    staged
                        ? queryKeys.entries.staged(type, id, locale)
                        : queryKeys.entries.get(type, id, locale),
                    saved
                );
                return saved;
            },
            meta: {
                invalidates,
                successMessage: 'entries.updated',
                errorMessage: 'entries.updateFailed',
                messageValues,
            },
        }),
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
            mutationFn: (id: string) => restoreEntry(type, id),
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
            mutationFn: (ids: string[]) => entries.restore({ type, ids }),
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
         * patch is the whole request; `data` writes the new row's own values.
         */
        createTranslation: mutationOptions({
            mutationKey: [...all, 'createTranslation'],
            mutationFn: ({
                id,
                locale,
                data = {},
            }: EntryLocale & { data?: EntryUpdateData }) =>
                entries.update({ type, id, locale, data }),
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
 * Restore one entry, and answer the slugs that changed in any of its locales,
 * read from every locale before and after.
 */
async function restoreEntry(type: string, id: string): Promise<ChangedSlug[]> {
    const entries = astromechUntypedClient.entries;
    const read = async (trashed: boolean) =>
        (
            await entries.query({
                type,
                where: { id },
                locale: 'all',
                limit: 'all',
                full: true,
                trashed,
            })
        ).data;
    const before = new Map((await read(true)).map((entry) => [entry.locale, entry.slug]));
    await entries.restore({ type, id });
    return (await read(false))
        .filter(
            (entry) => before.has(entry.locale) && before.get(entry.locale) !== entry.slug
        )
        .map(({ locale, slug }) => ({ locale, slug }));
}

/**
 * Restore one entry (`restore`) or a selection (`bulkRestore`), and toast the
 * result: unpublished when the type has statuses. A single restore names every
 * slug that changed; a bulk restore makes no extra reads, so it says only that
 * an entry whose slug was taken got a new one.
 */
export function useRestoreEntries(
    type: string,
    options: { name: string; statuses: boolean; translatable: boolean }
): {
    restore: UseMutationResult<ChangedSlug[], Error, string>;
    bulkRestore: UseMutationResult<Entry | Entry[], Error, string[]>;
} {
    const { name, statuses, translatable } = options;
    const { toast } = useToast();
    const { t } = useTranslation();
    const mutations = entryMutations(type, name);

    return {
        restore: useAdminMutation(mutations.restore, {
            onSuccess: (changed) => {
                const key = statuses ? 'entries.restoredUnpublished' : 'entries.restored';
                const restored = t(key, { name });
                const slugs = changed
                    .map(({ locale, slug }) =>
                        translatable ? `${slug} (${locale})` : slug
                    )
                    .join(', ');
                toast({
                    message:
                        changed.length === 0
                            ? restored
                            : `${restored} ${t('entries.restoredNewSlugs', { count: changed.length, slugs })}`,
                    variant: 'success',
                });
            },
        }),
        bulkRestore: useAdminMutation(mutations.bulkRestore, {
            onSuccess: () => {
                const restored = t(
                    statuses ? 'entries.bulkRestoredUnpublished' : 'entries.bulkRestored'
                );
                toast({
                    message: `${restored} ${t('entries.bulkRestoredNewSlugs')}`,
                    variant: 'success',
                });
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
