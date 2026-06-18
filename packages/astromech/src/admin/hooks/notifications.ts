/**
 * Query and mutation hooks for notifications.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Astromech } from '@/transport/http/client/index.js';
import { queryKeys } from './use-query-keys.js';
import { useToast } from '../components/ui/index.js';

// ============================================================================
// Query hooks
// ============================================================================

export function useNotifications(params?: { unread?: boolean }, enabled = true) {
    return useQuery({
        queryKey: queryKeys.notifications.list(params as Record<string, unknown>),
        queryFn: () => Astromech.notifications.list(params),
        enabled,
    });
}

export function useUnreadCount() {
    return useQuery({
        queryKey: queryKeys.notifications.unreadCount(),
        queryFn: () => Astromech.notifications.unreadCount(),
        refetchInterval: 30_000,
        refetchOnWindowFocus: true,
    });
}

// ============================================================================
// Mutation hooks
// ============================================================================

export function useMarkRead() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => Astromech.notifications.markRead(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.notifications.all(),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.notifications.unreadCount(),
            });
        },
    });
}

export function useMarkAllRead() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => Astromech.notifications.markAllRead(),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.notifications.all(),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.notifications.unreadCount(),
            });
        },
    });
}

export function useDismiss() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => Astromech.notifications.dismiss(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.notifications.all(),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.notifications.unreadCount(),
            });
        },
    });
}

export function useDismissAll() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { t } = useTranslation();

    return useMutation({
        mutationFn: () => Astromech.notifications.dismissAll(),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.notifications.all(),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.notifications.unreadCount(),
            });
            toast({ message: t('notifications.dismissedAll'), variant: 'success' });
        },
        onError: (err) => {
            toast({
                message:
                    err instanceof Error ? err.message : t('notifications.dismissFailed'),
                variant: 'error',
            });
        },
    });
}
