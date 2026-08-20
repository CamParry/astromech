/**
 * Notifications service — the per-user inbox verbs, plus the privileged
 * server-side `notify()` emit. Every verb names the user it acts for;
 * filtering on that `userId` is the authorization, not a permission.
 */

import type { NotificationRow } from './tables';
import type { Notification, NotifyInput } from '@/types/index';
import { createUserRepository } from '@/users/repository';
import { createNotificationRepository } from './repository';

/** The verbs, with the user each acts for named. */
export type NotificationsDomainService = {
    list(params: { userId: string }): Promise<Notification[]>;
    count(params: { userId: string }): Promise<number>;
    dismiss(params: { userId: string; id: string }): Promise<void>;
    dismissAll(params: { userId: string }): Promise<void>;
};

export const notificationsService: NotificationsDomainService = {
    async list(params) {
        const rows = await createNotificationRepository().listByUser(params.userId);
        return rows.map(toNotification);
    },

    async count(params) {
        return createNotificationRepository().countByUser(params.userId);
    },

    async dismiss(params) {
        await createNotificationRepository().dismiss(params.userId, params.id);
    },

    async dismissAll(params) {
        await createNotificationRepository().dismissAll(params.userId);
    },
};

/** Row → wire shape. `createdAt` crosses as an ISO string, as every date does. */
export function toNotification(row: NotificationRow): Notification {
    return {
        id: row.id,
        userId: row.userId,
        type: row.type,
        title: row.title,
        message: row.message,
        href: row.href ?? null,
        createdAt: row.createdAt.toISOString(),
    };
}

/**
 * Deliver one notification to every user the target names. Privileged: the
 * caller chooses the recipients, so this is server-side only and reaches no
 * session.
 */
export async function notify(input: NotifyInput): Promise<void> {
    const users = createUserRepository();

    let userIds: string[];

    if ('user' in input.target) {
        userIds = [input.target.user];
    } else if ('role' in input.target) {
        userIds = await users.idsByRole(input.target.role);
    } else {
        userIds = await users.ids();
    }

    if (userIds.length === 0) return;

    await createNotificationRepository().createMany(
        userIds.map((userId) => ({
            userId,
            type: input.type,
            title: input.title,
            message: input.message,
            href: input.href ?? null,
        }))
    );
}
