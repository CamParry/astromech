/**
 * The Local API's notifications handle.
 *
 * The client contract omits `userId`, so this adapts it onto the domain service
 * by reading the request context — the same fill the HTTP routes do from
 * `c.var.user`. In-process code is trusted, but a session-scoped method still
 * needs a session: outside a request there is no user for it to act as, and one
 * error says so rather than four stubs claiming the methods do not exist.
 */

import { notificationsService } from '@/notifications/index';
import { getCurrentUser } from '@/request-context/index';
import type { Notification, NotificationsService } from '@/types/index';

/** The signed-in user's id, or a loud failure naming what is missing. */
function currentUserId(): string {
    const user = getCurrentUser();
    if (user === null) {
        throw new Error(
            '[Astromech] notifications are session-scoped: they act on the signed-in ' +
                "user's own rows, and there is no request context here to name one. " +
                'Use `ctx.notify` to emit, or call this inside `runWithContext`.'
        );
    }
    return user.id;
}

export const localNotificationsService: NotificationsService = {
    list(): Promise<Notification[]> {
        return notificationsService.list({ userId: currentUserId() });
    },

    count(): Promise<number> {
        return notificationsService.count({ userId: currentUserId() });
    },

    dismiss(params: { id: string }): Promise<void> {
        return notificationsService.dismiss({ userId: currentUserId(), id: params.id });
    },

    dismissAll(): Promise<void> {
        return notificationsService.dismissAll({ userId: currentUserId() });
    },
};
