import type { NotificationRow } from './schema.js';
import { createNotificationStorage } from './storage.js';
import { createUserStorage } from '@/users/storage.js';
import type { Notification, NotifyInput } from '@/types/index.js';

// ============================================================================
// Serializer
// ============================================================================

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

// ============================================================================
// notify() — privileged server-side emit
// ============================================================================

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

// ============================================================================
// notificationsService — userId-explicit internal reads/writes
// ============================================================================

export const notificationsService = {
    async list(userId: string): Promise<NotificationRow[]> {
        return createNotificationStorage().listByUser(userId);
    },

    async count(userId: string): Promise<number> {
        return createNotificationStorage().countByUser(userId);
    },

    async dismiss(userId: string, id: string): Promise<void> {
        await createNotificationStorage().dismiss(userId, id);
    },

    async dismissAll(userId: string): Promise<void> {
        await createNotificationStorage().dismissAll(userId);
    },
};
