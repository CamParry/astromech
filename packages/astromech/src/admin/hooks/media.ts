/**
 * Query and mutation hooks for media.
 *
 * Upload is handled separately by useUploadMedia.
 */

import {
    useQuery,
    useMutation,
    useQueryClient,
    queryOptions,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Astromech } from '@/transport/http/client/index.js';
import { queryKeys } from './use-query-keys.js';
import { useToast } from '../components/ui/index.js';
import type { Media, MediaQueryParams } from '@/types/index.js';

// ============================================================================
// Query hooks
// ============================================================================

export function useMediaQuery(params?: MediaQueryParams) {
    return useQuery({
        queryKey: queryKeys.media.list(params as Record<string, unknown>),
        queryFn: () => Astromech.media.query(params),
    });
}

export function mediaItemQueryOptions(id: string) {
    return queryOptions({
        queryKey: queryKeys.media.detail(id),
        queryFn: () => Astromech.media.get({ id }),
    });
}

export function useMediaItem(id: string, enabled = true) {
    return useQuery({ ...mediaItemQueryOptions(id), enabled });
}

/**
 * Read-only: the index edges pointing at this media item. Rows are
 * index-shaped, so the caller resolves display titles itself.
 */
export function useMediaUsage(id: string, enabled = true) {
    return useQuery({
        queryKey: [...queryKeys.media.detail(id), 'usage'] as const,
        queryFn: () => Astromech.media.usedBy({ id }),
        enabled,
    });
}

// ============================================================================
// Mutation hooks
// ============================================================================

export function useUpdateMedia(
    id: string,
    options?: { onSuccess?: (media: Media) => void }
) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (data: Record<string, unknown>) =>
            Astromech.media.update({ id, data }),
        onSuccess: (media) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.media.detail(id),
            });
            void queryClient.invalidateQueries({ queryKey: queryKeys.media.all() });
            toast({ message: t('media.saved'), variant: 'success' });
            options?.onSuccess?.(media);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('media.saveFailed'),
                variant: 'error',
            });
        },
    });
}

export function useDeleteMedia(options?: { id?: string; onSuccess?: () => void }) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: (id?: string) =>
            Astromech.media.delete({ id: (options?.id ?? id) as string }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.media.all() });
            toast({ message: t('media.deleted'), variant: 'success' });
            options?.onSuccess?.();
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('media.deleteFailed'),
                variant: 'error',
            });
        },
    });
}

/**
 * Deletes each id independently so one failure doesn't abandon the rest, and
 * reports the shortfall instead of claiming a clean run.
 */
export function useBulkDeleteMedia(options?: {
    onSuccess?: (deletedIds: string[]) => void;
}) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: async (ids: string[]) => {
            const deletedIds: string[] = [];
            for (const id of ids) {
                try {
                    await Astromech.media.delete({ id });
                    deletedIds.push(id);
                } catch {
                    // Keep going: the remaining ids are still deletable.
                }
            }
            return { deletedIds, total: ids.length };
        },
        onSuccess: ({ deletedIds, total }) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.media.all() });
            if (deletedIds.length === total) {
                toast({
                    message: t('media.deletedToast', { count: total }),
                    variant: 'success',
                });
            } else {
                toast({
                    message: t('media.deletedPartialToast', {
                        deleted: deletedIds.length,
                        total,
                    }),
                    variant: 'warning',
                });
            }
            options?.onSuccess?.(deletedIds);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('media.deleteFailed'),
                variant: 'error',
            });
        },
    });
}
