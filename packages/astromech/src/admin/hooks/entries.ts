/**
 * Query and mutation hooks for entries. Mutation hooks bake in cache
 * invalidation and toasts; page-specific callbacks (e.g. navigation) are
 * accepted via optional onSuccess. Options-object client surface, type required.
 */

import type {
    EntriesService,
    Entry,
    EntryQueryParams,
    EntryStatus,
    JsonObject,
} from '@/types/index';
import {
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AstromechApiError, astromechClient } from '@/transport/http/client/index';
import { useToast } from '../components/ui/index';
import { queryKeys, scopedEntryKeys } from './use-query-keys';

/**
 * Optional mount binding: root callers omit both (root client, unprefixed
 * keys); plugin callers pass the bound entries client and the plugin name
 * as cache scope.
 */
export type EntryHookScope = {
    /**
     * Entries client bound to a base path. Defaults to root
     * `astromechClient.entries`.
     */
    api?: EntriesService;
    /** Cache-key scope. `''` (default) = root keys; plugin name = namespaced. */
    cacheScope?: string;
};

function resolveApi(scope?: EntryHookScope): EntriesService {
    return scope?.api ?? (astromechClient.entries as unknown as EntriesService);
}

function resolveKeys(scope?: EntryHookScope) {
    return scopedEntryKeys(scope?.cacheScope ?? '');
}

export function useEntriesQuery(
    params: EntryQueryParams & { type: string | readonly string[] },
    scope?: EntryHookScope
) {
    const typeKey = Array.isArray(params.type)
        ? params.type.join(',')
        : (params.type as string);
    const api = resolveApi(scope);
    const keys = resolveKeys(scope);
    return useQuery({
        queryKey: keys.list(typeKey, params as Record<string, unknown>),
        queryFn: () => api.query(params),
    });
}

export function entryQueryOptions(type: string, id: string, scope?: EntryHookScope) {
    const api = resolveApi(scope);
    const keys = resolveKeys(scope);
    return queryOptions({
        queryKey: keys.get(type, id),
        queryFn: () => api.get({ type, id }),
    });
}

export function entryVersionsQueryOptions(
    type: string,
    id: string,
    scope?: EntryHookScope
) {
    const api = resolveApi(scope);
    const keys = resolveKeys(scope);
    return queryOptions({
        queryKey: keys.versions(type, id),
        queryFn: () => api.versions({ type, id }),
    });
}

export function useEntry(type: string, id: string, scope?: EntryHookScope) {
    return useQuery(entryQueryOptions(type, id, scope));
}

export function useEntryVersions(
    type: string,
    id: string,
    enabled = true,
    scope?: EntryHookScope
) {
    return useQuery({ ...entryVersionsQueryOptions(type, id, scope), enabled });
}

/**
 * Read-only: fetch entries that reference `id` via a relationship row.
 * Used by the delete-confirmation modal to warn about dangling references.
 */
export function useIncomingRelationships(type: string, id: string, enabled = true) {
    return useQuery({
        queryKey: ['entries', type, 'incoming-relationships', id] as const,
        queryFn: () => astromechClient.entries.incomingRelationships({ type, id }),
        enabled,
    });
}

/**
 * Batch-fetch entries by id, across all locales. Used to load sibling-title
 * metadata for an entry's `locales` map.
 */
export function useEntriesByIds(type: string, ids: string[], enabled = true) {
    return useQuery({
        queryKey: queryKeys.entries.list(type, { _byIds: ids, locale: 'all' }),
        queryFn: () =>
            astromechClient.entries.query({
                type,
                locale: 'all',
                where: { id: { in: ids } },
                limit: 'all',
            }),
        enabled: enabled && ids.length > 0,
    });
}

export function useCreateEntry() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (payload: {
            type: string;
            title: string;
            fields: JsonObject;
            status?: EntryStatus;
        }) => astromechClient.entries.create(payload),
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(entry.type),
            });
            toast({ message: t('entries.created'), variant: 'success' });
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('entries.createFailed'),
                variant: 'error',
            });
        },
    });
}

export function useTrashEntry(
    type: string,
    options?: { onSuccess?: () => void } & EntryHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: (input: string | { id: string; cascadeLocales?: boolean }) => {
            const id = typeof input === 'string' ? input : input.id;
            const cascadeLocales =
                typeof input === 'string' ? false : !!input.cascadeLocales;
            return api.trash({ type, id, cascadeLocales });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: keys.all(type),
            });
            toast({
                message: t('entries.movedToTrash', { name: type }),
                variant: 'success',
            });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('entries.deleteFailed'),
                variant: 'error',
            });
        },
    });
}

export function useDeleteEntry(
    type: string,
    options?: { onSuccess?: () => void } & EntryHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: (input: string | { id: string; cascadeLocales?: boolean }) => {
            const id = typeof input === 'string' ? input : input.id;
            const cascadeLocales =
                typeof input === 'string' ? false : !!input.cascadeLocales;
            return api.delete({ type, id, cascadeLocales });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: keys.all(type),
            });
            toast({
                message: t('entries.permanentlyDeleted', { name: type }),
                variant: 'success',
            });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('entries.deleteFailed'),
                variant: 'error',
            });
        },
    });
}

export function useDuplicateEntry(
    type: string,
    options?: { onSuccess?: (entry: Entry) => void } & EntryHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: (id: string) => api.duplicate({ type, id }),
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({
                queryKey: keys.all(type),
            });
            toast({
                message: t('entries.duplicated', { name: type }),
                variant: 'success',
            });
            options?.onSuccess?.(entry);
        },
        onError: (err) => {
            toast({
                message:
                    err instanceof Error ? err.message : t('entries.duplicateFailed'),
                variant: 'error',
            });
        },
    });
}

export function useRestoreEntry(
    type: string,
    options?: { onSuccess?: () => void } & EntryHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: (id: string) => api.restore({ type, id }),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: keys.all(type),
            });
            toast({ message: t('entries.restored', { name: type }), variant: 'success' });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('entries.restoreFailed'),
                variant: 'error',
            });
        },
    });
}

export function usePublishEntry(
    type: string,
    id: string,
    options?: { onSuccess?: (entry: Entry) => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: () => astromechClient.entries.publish({ type, id }),
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.get(type, id),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(type),
            });
            toast({ message: t('entries.published'), variant: 'success' });
            options?.onSuccess?.(entry);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('entries.publishFailed'),
                variant: 'error',
            });
        },
    });
}

export function useUnpublishEntry(
    type: string,
    id: string,
    options?: { onSuccess?: (entry: Entry) => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: () => astromechClient.entries.unpublish({ type, id }),
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.get(type, id),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(type),
            });
            toast({ message: t('entries.unpublished'), variant: 'success' });
            options?.onSuccess?.(entry);
        },
        onError: (err) => {
            toast({
                message:
                    err instanceof Error ? err.message : t('entries.unpublishFailed'),
                variant: 'error',
            });
        },
    });
}

export function useScheduleEntry(
    type: string,
    id: string,
    options?: { onSuccess?: (entry: Entry) => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (publishedAt: Date) =>
            astromechClient.entries.schedule({ type, id, publishedAt }),
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.get(type, id),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(type),
            });
            toast({ message: t('entries.scheduled'), variant: 'success' });
            options?.onSuccess?.(entry);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('entries.scheduleFailed'),
                variant: 'error',
            });
        },
    });
}

// Bulk mutation hooks: each is atomic, a single client call per action.
function bulkErrorMessage(err: unknown, fallback: string): string {
    // The batch rolled back whole, so the id the server names is the row that
    // stopped it; it rides in `details`, as every wire-carried id does.
    if (err instanceof AstromechApiError) {
        const failedId = err.details?.['failedId'];
        return typeof failedId === 'string'
            ? `${err.message} (${failedId})`
            : err.message;
    }
    if (err instanceof Error) return err.message;
    return fallback;
}

export function useBulkTrashEntries(
    type: string,
    options?: { onSuccess?: () => void } & EntryHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: (ids: string[]) => api.trash({ type, id: ids }),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: keys.all(type),
            });
            toast({ message: t('entries.bulkTrashed'), variant: 'success' });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: bulkErrorMessage(err, t('entries.deleteFailed')),
                variant: 'error',
            });
        },
    });
}

export function useBulkDeleteEntries(
    type: string,
    options?: { onSuccess?: () => void } & EntryHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: (ids: string[]) => api.delete({ type, id: ids }),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: keys.all(type),
            });
            toast({ message: t('entries.bulkDeleted'), variant: 'success' });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: bulkErrorMessage(err, t('entries.deleteFailed')),
                variant: 'error',
            });
        },
    });
}

export function useBulkPublishEntries(
    type: string,
    options?: { onSuccess?: () => void } & EntryHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: (ids: string[]) => api.publish({ type, id: ids }),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: keys.all(type),
            });
            toast({ message: t('entries.bulkPublished'), variant: 'success' });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: bulkErrorMessage(err, t('entries.updateFailed')),
                variant: 'error',
            });
        },
    });
}

export function useBulkUnpublishEntries(
    type: string,
    options?: { onSuccess?: () => void } & EntryHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: (ids: string[]) => api.unpublish({ type, id: ids }),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: keys.all(type),
            });
            toast({ message: t('entries.bulkUnpublished'), variant: 'success' });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: bulkErrorMessage(err, t('entries.updateFailed')),
                variant: 'error',
            });
        },
    });
}

export function useRestoreEntryVersion(
    type: string,
    id: string,
    options?: { onSuccess?: () => void } & EntryHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: (versionId: string) => api.restoreVersion({ type, id, versionId }),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: keys.get(type, id),
            });
            void queryClient.invalidateQueries({
                queryKey: keys.versions(type, id),
            });
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

/**
 * Create a new entry that joins an existing locale group as a translation
 * of `sourceId`, inheriting its `localeGroup`. Used by the LocaleSwitcher's
 * "Create translation" action.
 */
export function useCreateTranslation(
    type: string,
    options?: { onSuccess?: (entry: Entry) => void; onError?: (err: Error) => void }
) {
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: async ({
            sourceId,
            locale,
        }: {
            sourceId: string;
            locale: string;
        }): Promise<Entry> => {
            const source = await astromechClient.entries.get({ type, id: sourceId });
            if (!source) throw new Error(`Entry ${sourceId} not found`);
            return astromechClient.entries.duplicate({
                type,
                id: sourceId,
                overrides: { locale, localeGroup: source.localeGroup },
            }) as Promise<Entry>;
        },
        onSuccess: (entry) => {
            options?.onSuccess?.(entry);
        },
        onError: (err) => {
            toast({
                message:
                    err instanceof Error ? err.message : t('translations.createFailed'),
                variant: 'error',
            });
            options?.onError?.(err);
        },
    });
}

// Forward versioning: hooks for staged entries.
/** The canonical entry's staged change, or null. */
export function useGetStaged(
    type: string,
    id: string,
    enabled = true,
    scope?: EntryHookScope
) {
    const api = resolveApi(scope);
    const keys = resolveKeys(scope);
    return useQuery({
        queryKey: keys.staged(type, id),
        queryFn: () => api.getStaged({ type, id }),
        enabled,
    });
}

/**
 * Stage a change on a canonical entry. On a 409 (a staged change already
 * exists), `onConflict` is called with the existing staged id so the page
 * can redirect to it.
 */
export function useCreateStaged(
    type: string,
    options?: {
        onSuccess?: (entry: Entry) => void;
        onConflict?: (stagedId: string) => void;
    } & EntryHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: (id: string) => api.createStaged({ type, id }),
        onSuccess: (entry, id) => {
            void queryClient.invalidateQueries({ queryKey: keys.staged(type, id) });
            void queryClient.invalidateQueries({ queryKey: keys.all(type) });
            options?.onSuccess?.(entry);
        },
        onError: (err) => {
            if (
                err instanceof AstromechApiError &&
                err.code === 'staged_entry_exists' &&
                typeof err.details?.['stagedId'] === 'string'
            ) {
                options?.onConflict?.(err.details['stagedId']);
                return;
            }
            toast({
                message: err instanceof Error ? err.message : t('staging.stageFailed'),
                variant: 'error',
            });
        },
    });
}

/** Merge the canonical's staged change into it (content-only, backup→update→cleanup). */
export function useMergeStaged(
    type: string,
    id: string,
    options?: { onSuccess?: (entry: Entry) => void } & EntryHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: () => api.mergeStaged({ type, id }),
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({ queryKey: keys.get(type, id) });
            void queryClient.invalidateQueries({ queryKey: keys.staged(type, id) });
            void queryClient.invalidateQueries({ queryKey: keys.all(type) });
            toast({ message: t('staging.merged'), variant: 'success' });
            options?.onSuccess?.(entry);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('staging.mergeFailed'),
                variant: 'error',
            });
        },
    });
}

/** Discard the canonical's staged change (hard delete). */
export function useDeleteStaged(
    type: string,
    id: string,
    options?: { onSuccess?: () => void } & EntryHookScope
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);
    const keys = resolveKeys(options);

    return useMutation({
        mutationFn: () => api.deleteStaged({ type, id }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: keys.staged(type, id) });
            void queryClient.invalidateQueries({ queryKey: keys.all(type) });
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

/** Issue a preview token for a canonical entry (plaintext token returned once). */
export function useIssuePreviewToken(type: string, id: string, scope?: EntryHookScope) {
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(scope);

    return useMutation({
        mutationFn: () => api.issuePreviewToken({ type, id }),
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('staging.previewFailed'),
                variant: 'error',
            });
        },
    });
}

/** Revoke a canonical entry's preview token(s). */
export function useRevokePreviewToken(
    type: string,
    id: string,
    options?: { onSuccess?: () => void } & EntryHookScope
) {
    const { toast } = useToast();
    const { t } = useTranslation();
    const api = resolveApi(options);

    return useMutation({
        mutationFn: () => api.revokePreviewToken({ type, id }),
        onSuccess: () => {
            toast({ message: t('staging.previewRevoked'), variant: 'success' });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('staging.previewFailed'),
                variant: 'error',
            });
        },
    });
}
