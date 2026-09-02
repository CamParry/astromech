/**
 * Query and mutation hooks for globals — the subset of `hooks/entries.ts` a
 * global needs. There is no list, trash, delete, duplicate, preview token or
 * create-translation hook: a global exists because the config declares it, and
 * a locale it has never been saved in is written by the first `update` there.
 */

import type { Global, GlobalsService } from '@/types/index';
import {
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AstromechApiError, astromechClient } from '@/transport/http/client';
import { useToast } from '../components/ui/toast';
import { scopedGlobalKeys } from './use-query-keys';

/**
 * Optional mount binding: host callers omit both (host client, unprefixed
 * keys); plugin callers pass the bound globals client and the plugin name as
 * cache scope.
 */
export type GlobalHookScope = {
    /** Globals client. Defaults to the root `astromechClient.globals`. */
    api?: GlobalsService;
    /** Cache-key scope. `''` (default) = host keys; plugin name = namespaced. */
    cacheScope?: string;
};

function resolveApi(scope?: GlobalHookScope): GlobalsService {
    return scope?.api ?? (astromechClient.globals as unknown as GlobalsService);
}

function resolveKeys(scope?: GlobalHookScope) {
    return scopedGlobalKeys(scope?.cacheScope ?? '');
}

export function globalQueryOptions(key: string, locale: string, scope?: GlobalHookScope) {
    const api = resolveApi(scope);
    const keys = resolveKeys(scope);
    return queryOptions({
        queryKey: keys.get(key, locale),
        // `full` is the admin read: the whole row whatever its status, not the
        // published-only public shape.
        queryFn: () => api.get({ key, locale, full: true }),
    });
}

export function globalVersionsQueryOptions(
    key: string,
    locale: string,
    scope?: GlobalHookScope
) {
    const api = resolveApi(scope);
    const keys = resolveKeys(scope);
    return queryOptions({
        queryKey: keys.versions(key, locale),
        queryFn: () => api.versions({ key, locale }),
    });
}

/**
 * One locale of one global. `null` is loaded-and-empty — a declared global
 * nobody has saved yet — not an error, so the edit page renders a blank form
 * whose first save creates the row.
 */
export function useGlobal(key: string, locale: string, scope?: GlobalHookScope) {
    return useQuery(globalQueryOptions(key, locale, scope));
}

export function useGlobalVersions(
    key: string,
    locale: string,
    enabled = true,
    scope?: GlobalHookScope
) {
    return useQuery({ ...globalVersionsQueryOptions(key, locale, scope), enabled });
}

export function useRestoreGlobalVersion(
    key: string,
    locale: string,
    options?: { onSuccess?: () => void } & GlobalHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: (versionId: string) => api.restoreVersion({ key, locale, versionId }),
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
export function useGetStagedGlobal(
    key: string,
    locale: string,
    enabled = true,
    scope?: GlobalHookScope
) {
    const api = resolveApi(scope);
    const keys = resolveKeys(scope);
    return useQuery({
        queryKey: keys.staged(key, locale),
        queryFn: () => api.getStaged({ key, locale }),
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
    } & GlobalHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: () => api.createStaged({ key, locale }),
        onSuccess: (global) => {
            void queryClient.invalidateQueries({ queryKey: keys.staged(key, locale) });
            void queryClient.invalidateQueries({ queryKey: keys.all(key) });
            options?.onSuccess?.(global);
        },
        onError: (err) => {
            if (err instanceof AstromechApiError && err.code === 'staged_global_exists') {
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
    options?: { onSuccess?: (global: Global) => void } & GlobalHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: () => api.mergeStaged({ key, locale }),
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
    options?: { onSuccess?: () => void } & GlobalHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: () => api.deleteStaged({ key, locale }),
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
