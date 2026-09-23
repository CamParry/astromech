/**
 * Queries and mutations for notifications. `notificationMutations()` is the
 * table of writes; `useAdminMutation` runs them.
 */

import { mutationOptions, useQuery } from '@tanstack/react-query';
import { astromechUntypedClient } from 'astromech/fetch';
import { queryKeys } from './use-query-keys';

export function useNotifications(params?: Record<string, unknown>, enabled = true) {
    return useQuery({
        queryKey: queryKeys.notifications.list(params),
        queryFn: () => astromechUntypedClient.notifications.list(),
        enabled,
    });
}

export function useNotificationCount() {
    return useQuery({
        queryKey: queryKeys.notifications.count(),
        queryFn: () => astromechUntypedClient.notifications.count(),
        refetchInterval: 30_000,
        refetchOnWindowFocus: true,
    });
}

/** Every write the admin makes to notifications; each refreshes the list and the count. */
export function notificationMutations() {
    const notifications = astromechUntypedClient.notifications;
    const invalidates = [queryKeys.notifications.all()];
    return {
        dismiss: mutationOptions({
            mutationKey: ['notifications', 'dismiss'],
            mutationFn: (id: string) => notifications.dismiss({ id }),
            meta: { invalidates, errorMessage: 'notifications.dismissFailed' },
        }),
        dismissAll: mutationOptions({
            mutationKey: ['notifications', 'dismissAll'],
            mutationFn: () => notifications.dismissAll(),
            meta: {
                invalidates,
                successMessage: 'notifications.dismissedAll',
                errorMessage: 'notifications.dismissFailed',
            },
        }),
    };
}
