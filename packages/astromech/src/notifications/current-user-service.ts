/**
 * The notifications service as in-process consumers hold it: the same domain
 * methods with `userId` filled from the request context, the way the HTTP routes
 * fill it from `c.var.user`.
 *
 * In-process code is trusted, but a session-scoped method still needs a session:
 * outside a request there is no user for it to act as, and one error says so
 * rather than four stubs claiming the methods do not exist.
 */

import { notificationsService } from '@/notifications/service';
import { getCurrentUser } from '@/request-context/request-context';
import type { Notification, NotificationsService } from '@/types/index';

/** The signed-in user's id, or a loud failure naming what is missing. */
async function currentUserId(): Promise<string> {
    const user = await getCurrentUser();
    if (user === null) {
        throw new Error(
            '[Astromech] notifications are session-scoped: they act on the signed-in ' +
                "user's own rows, and there is no request context here to name one. " +
                'Use `ctx.notify` to emit, or call this inside `runWithRequest`.'
        );
    }
    return user.id;
}

export const currentUserNotificationsService: NotificationsService = {
    async list(): Promise<Notification[]> {
        return notificationsService.list({ userId: await currentUserId() });
    },

    async count(): Promise<number> {
        return notificationsService.count({ userId: await currentUserId() });
    },

    async dismiss(params: { id: string }): Promise<void> {
        return notificationsService.dismiss({
            userId: await currentUserId(),
            id: params.id,
        });
    },

    async dismissAll(): Promise<void> {
        return notificationsService.dismissAll({ userId: await currentUserId() });
    },
};
