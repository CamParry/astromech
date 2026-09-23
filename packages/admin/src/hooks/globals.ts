/**
 * Queries and mutations for globals: the subset of `hooks/entries.ts` a global
 * needs. A global exists because the config declares it, and a locale it was
 * never saved in is written by the first `update` there.
 */

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

/**
 * One locale of one global. `null` is loaded-and-empty — a declared global
 * nobody has saved yet — not an error, so the edit page renders a blank form
 * whose first save creates the row.
 */
export function useGlobal(key: string, locale: string) {
    return useQuery(globalQueryOptions(key, locale));
}

export function useGlobalVersions(key: string, locale: string, enabled = true) {
    return useQuery({ ...globalVersionsQueryOptions(key, locale), enabled });
}

/** This locale's staged change, or null. */
export function useGetStagedGlobal(key: string, locale: string, enabled = true) {
    const keys = queryKeys.globals;
    return useQuery({
        queryKey: keys.staged(key, locale),
        queryFn: () => astromechUntypedClient.globals.getStaged({ key, locale }),
        enabled,
    });
}

/** Every write the admin makes to one global, each invalidating the global's keys. */
export function globalMutations(key: string) {
    const globals = astromechUntypedClient.globals;
    const all = queryKeys.globals.all(key);
    const invalidates = [all];
    return {
        restoreVersion: mutationOptions({
            mutationKey: [...all, 'restoreVersion'],
            mutationFn: ({ locale, versionId }: { locale: string; versionId: string }) =>
                globals.restoreVersion({ key, locale, versionId }),
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
