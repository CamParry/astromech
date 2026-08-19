/**
 * Query and mutation hooks for notifications.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { astromechClient } from '@/transport/http/client/index';
import { useToast } from '../components/ui/index';
import { queryKeys } from './use-query-keys';

// ============================================================================
// Query hooks
// ============================================================================

export function useNotifications(params?: Record<string, unknown>, enabled = true) {
    return useQuery({
        queryKey: queryKeys.notifications.list(params),
        queryFn: () => astromechClient.notifications.list(),
        enabled,
    });
}

export function useNotificationCount() {
    return useQuery({
        queryKey: queryKeys.notifications.count(),
        queryFn: () => astromechClient.notifications.count(),
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
        mutationFn: (id: string) => astromechClient.notifications.dismiss({ id }),
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
        mutationFn: () => astromechClient.notifications.dismissAll(),
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
