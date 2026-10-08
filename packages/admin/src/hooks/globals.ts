/**
 * Queries and mutations for globals: the subset of `hooks/entries.ts` a global
 * needs. A global exists because the config declares it, and a locale it was
 * never saved in is written by the first `update` there.
 */

import type { GlobalUpdateData } from 'astromech';
import { mutationOptions, queryOptions, useQuery } from '@tanstack/react-query';
import { astromechUntypedClient } from 'astromech/fetch';
import { openExisting } from './entries';
import { queryKeys } from './use-query-keys';

export function globalQueryOptions(key: string, locale: string) {
    const keys = queryKeys.globals;
    return queryOptions({
        queryKey: keys.get(key, locale),
        // `full` is the admin read: the whole row whatever its status, not the
        // published-only public shape.
        queryFn: () => astromechUntypedClient.globals.get({ key, locale, full: true }),
    });
}

export function globalVersionsQueryOptions(key: string, locale: string) {
    const keys = queryKeys.globals;
    return queryOptions({
        queryKey: keys.versions(key, locale),
        queryFn: () => astromechUntypedClient.globals.versions({ key, locale }),
    });
}

/** One saved version of one locale of a global, with its snapshot. */
export function globalVersionQueryOptions(key: string, locale: string, version: number) {
    return queryOptions({
        queryKey: queryKeys.globals.version(key, locale, version),
        queryFn: () =>
            astromechUntypedClient.globals.getVersion({ key, locale, version }),
    });
}

export function useGlobalVersions(key: string, locale: string, enabled = true) {
    return useQuery({ ...globalVersionsQueryOptions(key, locale), enabled });
}

/**
 * Every write the admin makes to one global, each invalidating the global's
 * keys. `name` is what the toasts call the global.
 */
export function globalMutations(key: string, name: string = key) {
    const globals = astromechUntypedClient.globals;
    const all = queryKeys.globals.all(key);
    const invalidates = [all];
    return {
        /**
         * Save one locale, or its staged change when `staged` is true. A
         * staged row carries no status of its own: it takes the canonical's
         * when it is merged. The saved row is written to its key before the
         * invalidation, as `entryMutations` does.
         */
        update: mutationOptions({
            mutationKey: [...all, 'update'],
            mutationFn: async (
                {
                    locale,
                    staged,
                    data: { fields, status, publishedAt },
                }: { locale: string; staged: boolean; data: GlobalUpdateData },
                { client }
            ) => {
                const saved = await globals.update({
                    key,
                    locale,
                    staged,
                    data: staged
                        ? { fields }
                        : {
                              fields,
                              ...(status !== undefined ? { status } : {}),
                              ...(publishedAt !== undefined ? { publishedAt } : {}),
                          },
                });
                client.setQueryData(
                    staged
                        ? queryKeys.globals.staged(key, locale)
                        : queryKeys.globals.get(key, locale),
                    saved
                );
                return saved;
            },
            meta: {
                invalidates,
                successMessage: 'entries.updated',
                errorMessage: 'entries.updateFailed',
                messageValues: { name },
            },
        }),
        restoreVersion: mutationOptions({
            mutationKey: [...all, 'restoreVersion'],
            mutationFn: ({ locale, version }: { locale: string; version: number }) =>
                globals.restoreVersion({ key, locale, version }),
            meta: {
                invalidates,
                successMessage: 'versions.restored',
                errorMessage: 'versions.restoreFailed',
            },
        }),
        /** Stage a change on one locale; one that already exists resolves as `null`. */
        createStaged: mutationOptions({
            mutationKey: [...all, 'createStaged'],
            mutationFn: ({ locale }: { locale: string }) =>
                globals.createStaged({ key, locale }).catch(openExisting),
            meta: { invalidates, errorMessage: 'staging.stageFailed' },
        }),
        mergeStaged: mutationOptions({
            mutationKey: [...all, 'mergeStaged'],
            mutationFn: ({ locale }: { locale: string }) =>
                globals.mergeStaged({ key, locale }),
            meta: {
                invalidates,
                successMessage: 'staging.merged',
                errorMessage: 'staging.mergeFailed',
            },
        }),
        deleteStaged: mutationOptions({
            mutationKey: [...all, 'deleteStaged'],
            mutationFn: ({ locale }: { locale: string }) =>
                globals.deleteStaged({ key, locale }),
            meta: {
                invalidates,
                successMessage: 'staging.discarded',
                errorMessage: 'staging.discardFailed',
            },
        }),
    };
}
