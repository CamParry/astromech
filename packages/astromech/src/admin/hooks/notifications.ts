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

export function useNotifications(params?: Record<string, unknown>, enabled = true) {
    return useQuery({
        queryKey: queryKeys.notifications.list(params),
        queryFn: () => Astromech.notifications.list(),
        enabled,
    });
}

export function useNotificationCount() {
    return useQuery({
        queryKey: queryKeys.notifications.count(),
        queryFn: () => Astromech.notifications.count(),
        refetchInterval: 30_000,
        refetchOnWindowFocus: true,
    });
}

// ============================================================================
// Mutation hooks
// ============================================================================

export function useDismiss() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => Astromech.notifications.dismiss(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.notifications.all(),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.notifications.count(),
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
                queryKey: queryKeys.notifications.count(),
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
