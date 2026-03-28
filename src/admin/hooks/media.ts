/**
 * Query and mutation hooks for media.
 *
 * Upload is handled separately by useUploadMedia.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Astromech } from '@/sdk/fetch/index.js';
import { queryKeys } from './use-query-keys.js';
import { useToast } from '../components/ui/index.js';
import type { Media } from '@/types/index.js';

// ============================================================================
// Query hooks
// ============================================================================

export function useMediaList(params: Record<string, unknown>) {
    return useQuery({
        queryKey: queryKeys.media.list(params),
        queryFn: () => Astromech.media.list(params),
    });
}

export function useMediaItem(id: string, enabled = true) {
    return useQuery({
        queryKey: queryKeys.media.detail(id),
        queryFn: () => Astromech.media.get(id),
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
        mutationFn: (data: Record<string, unknown>) => Astromech.media.update(id, data),
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
        mutationFn: (id?: string) => Astromech.media.delete(options?.id ?? id!),
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

export function useBulkDeleteMedia(options?: { onSuccess?: (ids: string[]) => void }) {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: async (ids: string[]) => {
            for (const id of ids) {
                await Astromech.media.delete(id);
            }
            return ids;
        },
        onSuccess: (ids) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.media.all() });
            toast({
                message: t('media.deletedToast', { count: ids.length }),
                variant: 'success',
            });
            options?.onSuccess?.(ids);
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('media.deleteFailed'),
                variant: 'error',
            });
        },
    });
}
