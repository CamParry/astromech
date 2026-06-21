/**
 * Query and mutation hooks for entries.
 *
 * Query hooks wrap useQuery for reading entry data.
 * Mutation hooks wrap useMutation, baking in cache invalidation and toasts
 * for consistent operations. Page-specific callbacks (e.g. navigation) are
 * accepted via optional onSuccess.
 *
 * SDK surface: options-object, type required.
 */

import {
    useQuery,
    useMutation,
    useQueryClient,
    queryOptions,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Astromech, AstromechApiError } from '@/transport/http/client/index.js';
import { queryKeys, scopedEntryKeys } from './use-query-keys.js';
import { useToast } from '../components/ui/index.js';
import type {
    Entry,
    EntriesApi,
    EntryStatus,
    EntryUpdateData,
    JsonObject,
    EntryQueryParams,
} from '@/types/index.js';

// ============================================================================
// Mount scoping
// ============================================================================

/**
 * Optional mount binding. Root callers omit both (defaults reproduce today's
 * behaviour exactly: the root `Astromech.entries` client and unprefixed keys).
 * Plugin callers pass the bound entries client and the plugin name as scope.
 */
export type EntryHookScope = {
    /** Entries client bound to a base path. Defaults to root `Astromech.entries`. */
    api?: EntriesApi;
    /** Cache-key scope. `''` (default) = root keys; plugin name = namespaced. */
    cacheScope?: string;
};

function resolveApi(scope?: EntryHookScope): EntriesApi {
    return scope?.api ?? (Astromech.entries as unknown as EntriesApi);
}

function resolveKeys(scope?: EntryHookScope) {
    return scopedEntryKeys(scope?.cacheScope ?? '');
}

// ============================================================================
// Query hooks
// ============================================================================

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
export function useIncomingRelations(type: string, id: string, enabled = true) {
    return useQuery({
        queryKey: ['entries', type, 'incoming-relations', id] as const,
        queryFn: () => Astromech.entries.incomingRelations({ type, id }),
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
            Astromech.entries.query({
                type,
                locale: 'all',
                where: { id: { in: ids } },
                limit: 'all',
            }),
        enabled: enabled && ids.length > 0,
    });
}

// ============================================================================
// Mutation hooks
// ============================================================================

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
        }) => Astromech.entries.create(payload),
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

export function useUpdateEntry(
    type: string,
    id: string,
    options?: {
        onSuccess?: (entry: Entry) => void;
        onError?: (err: Error) => void;
    }
) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (payload: Record<string, unknown>) =>
            Astromech.entries.update({
                type,
                id,
                data: payload as EntryUpdateData,
            }),
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.get(type, id),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(type),
            });
            options?.onSuccess?.(entry);
        },
        onError: (err) => {
            options?.onError?.(err);
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
        mutationFn: () => Astromech.entries.publish({ type, id }),
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
        mutationFn: () => Astromech.entries.unpublish({ type, id }),
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
        mutationFn: (publishAt: Date) =>
            Astromech.entries.schedule({ type, id, publishAt }),
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

// ============================================================================
// Bulk mutation hooks (atomic — single SDK call per action)
// ============================================================================

function bulkErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error) {
        const failedId = (err as { failedId?: string }).failedId;
        return failedId ? `${err.message}` : err.message;
    }
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
 * Mutation: create a new entry that joins an existing locale group as a
 * translation of `sourceId`. Used by the LocaleSwitcher "Create translation" CTA.
 *
 * Implementation: reads the source via Astromech.entries.get, then calls
 * Astromech.entries.duplicate({ type, id: sourceId, overrides: { locale, localeGroup } })
 * so the new row inherits the source's localeGroup.
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
            const source = await Astromech.entries.get({ type, id: sourceId });
            if (!source) throw new Error(`Entry ${sourceId} not found`);
            return Astromech.entries.duplicate({
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

// ============================================================================
// Forward versioning (staged entries) hooks
// ============================================================================

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
 * Stage a change on a canonical entry. On success the new staged entry is
 * returned; if one already exists the API replies 409 and `onConflict` is called
 * with the existing staged id so the page can redirect to it (the service stays
 * dumb — the UI owns the redirect).
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
