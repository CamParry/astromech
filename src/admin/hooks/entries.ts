/**
 * Query and mutation hooks for entries.
 *
 * Query hooks wrap useQuery for reading entry data.
 * Mutation hooks wrap useMutation, baking in cache invalidation and toasts
 * for consistent operations. Page-specific callbacks (e.g. navigation) are
 * accepted via optional onSuccess.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Astromech } from '@/sdk/fetch/index.js';
import { queryKeys } from './use-query-keys.js';
import { useToast } from '../components/ui/index.js';
import type { Entry, EntryStatus, JsonObject, EntryQueryParams } from '@/types/index.js';

// ============================================================================
// Query hooks
// ============================================================================

export function useEntriesQuery(params?: EntryQueryParams) {
    return useQuery({
        queryKey: queryKeys.entries.list(params?.type ?? '', params as Record<string, unknown>),
        queryFn: () => Astromech.entries.query(params),
    });
}

export function useEntry(type: string, id: string) {
    return useQuery({
        queryKey: queryKeys.entries.detail(type, id),
        queryFn: () => Astromech.entries.get(id),
    });
}

export function useEntryVersions(type: string, id: string, enabled = true) {
    return useQuery({
        queryKey: queryKeys.entries.versions(type, id),
        queryFn: () => Astromech.entries.versions(id),
        enabled,
    });
}

export function useEntryTranslations(type: string, sourceId: string, enabled = true) {
    return useQuery({
        queryKey: queryKeys.entries.translations(type, sourceId),
        queryFn: () => Astromech.entries.translations(sourceId),
        enabled,
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
            Astromech.entries.update(id, payload),
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.detail(type, id),
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
    options?: { onSuccess?: () => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (id: string) => Astromech.entries.trash(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(type),
            });
            toast({ message: t('entries.movedToTrash', { name: type }), variant: 'success' });
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
    options?: { onSuccess?: () => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (id: string) => Astromech.entries.delete(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(type),
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
    options?: { onSuccess?: (entry: Entry) => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (id: string) => Astromech.entries.duplicate(id),
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(type),
            });
            toast({ message: t('entries.duplicated', { name: type }), variant: 'success' });
            options?.onSuccess?.(entry);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('entries.duplicateFailed'),
                variant: 'error',
            });
        },
    });
}

export function useRestoreEntry(
    type: string,
    options?: { onSuccess?: () => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (id: string) => Astromech.entries.restore(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(type),
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
        mutationFn: () => Astromech.entries.publish(id),
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.detail(type, id),
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
        mutationFn: () => Astromech.entries.unpublish(id),
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.detail(type, id),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(type),
            });
            toast({ message: t('entries.unpublished'), variant: 'success' });
            options?.onSuccess?.(entry);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('entries.unpublishFailed'),
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
        mutationFn: (publishAt: Date) => Astromech.entries.schedule(id, publishAt),
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.detail(type, id),
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

export function useBulkTrashEntries(
    type: string,
    options?: { onSuccess?: () => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (ids: string[]) =>
            Promise.all(ids.map((id) => Astromech.entries.trash(id))),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(type),
            });
            toast({ message: t('entries.bulkTrashed'), variant: 'success' });
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

export function useBulkDeleteEntries(
    type: string,
    options?: { onSuccess?: () => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (ids: string[]) =>
            Promise.all(ids.map((id) => Astromech.entries.delete(id))),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(type),
            });
            toast({ message: t('entries.bulkDeleted'), variant: 'success' });
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

export function useBulkPublishEntries(
    type: string,
    options?: { onSuccess?: () => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (ids: string[]) =>
            Promise.all(
                ids.map((id) => Astromech.entries.update(id, { status: 'published' }))
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(type),
            });
            toast({ message: t('entries.bulkPublished'), variant: 'success' });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('entries.updateFailed'),
                variant: 'error',
            });
        },
    });
}

export function useBulkUnpublishEntries(
    type: string,
    options?: { onSuccess?: () => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (ids: string[]) =>
            Promise.all(
                ids.map((id) => Astromech.entries.update(id, { status: 'draft' }))
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.all(type),
            });
            toast({ message: t('entries.bulkUnpublished'), variant: 'success' });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('entries.updateFailed'),
                variant: 'error',
            });
        },
    });
}

export function useRestoreEntryVersion(
    type: string,
    id: string,
    options?: { onSuccess?: () => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (versionId: string) =>
            Astromech.entries.restoreVersion(id, versionId),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.detail(type, id),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.entries.versions(type, id),
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

export function useCreateTranslation(
    _type: string,
    options?: { onSuccess?: (entry: Entry) => void; onError?: (err: Error) => void }
) {
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: ({ sourceId, locale }: { sourceId: string; locale: string }) =>
            Astromech.entries.createTranslation(sourceId, locale),
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
