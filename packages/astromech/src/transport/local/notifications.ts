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

export const localNotificationsService: NotificationsService = {
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
