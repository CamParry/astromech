/**
 * Notifications service — the per-user inbox verbs, plus the privileged
 * server-side `notify()` emit.
 *
 * Every verb NAMES the user it acts for, and filtering on that `userId` is the
 * authorization: there is no permission to hold, only rows that are yours. The
 * client-facing `NotificationsService` (`types/services.ts`) omits it because
 * each transport fills it from the session — the HTTP routes from `c.var.user`,
 * the scoped handle and the Local API from the request context. The contracts in
 * `methods.ts` declare that with `sessionScoped`; `decisions/0037` is why.
 */

import type { NotificationRow } from './schema';
import type { Notification, NotifyInput } from '@/types/index';
import { createUserStorage } from '@/users/storage';
import { createNotificationStorage } from './storage';

/** The verbs, with the user each acts for named. */
export type NotificationsDomainService = {
    list(params: { userId: string }): Promise<Notification[]>;
    count(params: { userId: string }): Promise<number>;
    dismiss(params: { userId: string; id: string }): Promise<void>;
    dismissAll(params: { userId: string }): Promise<void>;
};

export const notificationsService: NotificationsDomainService = {
    async list(params) {
        const rows = await createNotificationStorage().listByUser(params.userId);
        return rows.map(toNotification);
    },

    async count(params) {
        return createNotificationStorage().countByUser(params.userId);
    },

    async dismiss(params) {
        await createNotificationStorage().dismiss(params.userId, params.id);
    },

    async dismissAll(params) {
        await createNotificationStorage().dismissAll(params.userId);
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
    const users = createUserStorage();

    let userIds: string[];

    if ('user' in input.target) {
        userIds = [input.target.user];
    } else if ('role' in input.target) {
        userIds = await users.idsByRole(input.target.role);
    } else {
        userIds = await users.ids();
    }

    if (userIds.length === 0) return;

    await createNotificationStorage().createMany(
        userIds.map((userId) => ({
            userId,
            type: input.type,
            title: input.title,
            message: input.message,
            href: input.href ?? null,
        }))
    );
}
