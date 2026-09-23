/**
 * Query and mutation hooks for globals — the subset of `hooks/entries.ts` a
 * global needs. There is no list, trash, delete, duplicate, preview token or
 * create-translation hook: a global exists because the config declares it, and
 * a locale it has never been saved in is written by the first `update` there.
 */

import type { Global } from 'astromech';
import {
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { AstromechApiError, astromechUntypedClient } from 'astromech/fetch';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/ui/toast';
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

export function useRestoreGlobalVersion(
    key: string,
    locale: string,
    options?: { onSuccess?: () => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const keys = queryKeys.globals;

    return useMutation({
        mutationFn: (versionId: string) =>
            astromechUntypedClient.globals.restoreVersion({ key, locale, versionId }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: keys.get(key, locale) });
            void queryClient.invalidateQueries({ queryKey: keys.versions(key, locale) });
            toast({ message: t('versions.restored'), variant: 'success' });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('versions.restoreFailed'),
                variant: 'error',
            });
        },
    });
}

// Forward versioning: hooks for staged globals.
/** This locale's staged change, or null. */
export function useGetStagedGlobal(key: string, locale: string, enabled = true) {
    const keys = queryKeys.globals;
    return useQuery({
        queryKey: keys.staged(key, locale),
        queryFn: () => astromechUntypedClient.globals.getStaged({ key, locale }),
        enabled,
    });
}

/**
 * Stage a change on one locale of a global. A staged row already existing is
 * not a failure the editor can act on — `onConflict` opens the existing one.
 */
export function useCreateStagedGlobal(
    key: string,
    locale: string,
    options?: {
        onSuccess?: (global: Global) => void;
        onConflict?: () => void;
    }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const keys = queryKeys.globals;

    return useMutation({
        mutationFn: () => astromechUntypedClient.globals.createStaged({ key, locale }),
        onSuccess: (global) => {
            void queryClient.invalidateQueries({ queryKey: keys.staged(key, locale) });
            void queryClient.invalidateQueries({ queryKey: keys.all(key) });
            options?.onSuccess?.(global);
        },
        onError: (err) => {
            if (err instanceof AstromechApiError && err.code === 'staged_change_exists') {
                options?.onConflict?.();
                return;
            }
            toast({
                message: err instanceof Error ? err.message : t('staging.stageFailed'),
                variant: 'error',
            });
        },
    });
}

/** Merge this locale's staged change into the canonical row. */
export function useMergeStagedGlobal(
    key: string,
    locale: string,
    options?: { onSuccess?: (global: Global) => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const keys = queryKeys.globals;

    return useMutation({
        mutationFn: () => astromechUntypedClient.globals.mergeStaged({ key, locale }),
        onSuccess: (global) => {
            void queryClient.invalidateQueries({ queryKey: keys.get(key, locale) });
            void queryClient.invalidateQueries({ queryKey: keys.staged(key, locale) });
            void queryClient.invalidateQueries({ queryKey: keys.all(key) });
            toast({ message: t('staging.merged'), variant: 'success' });
            options?.onSuccess?.(global);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('staging.mergeFailed'),
                variant: 'error',
            });
        },
    });
}

/** Discard this locale's staged change (hard delete). */
export function useDeleteStagedGlobal(
    key: string,
    locale: string,
    options?: { onSuccess?: () => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const keys = queryKeys.globals;

    return useMutation({
        mutationFn: () => astromechUntypedClient.globals.deleteStaged({ key, locale }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: keys.staged(key, locale) });
            void queryClient.invalidateQueries({ queryKey: keys.all(key) });
            toast({ message: t('staging.discarded'), variant: 'success' });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('staging.discardFailed'),
                variant: 'error',
            });
        },
    });
}
