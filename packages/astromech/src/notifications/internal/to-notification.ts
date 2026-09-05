import type { NotificationRow } from '../tables';
import type { Notification } from '@/types/index';

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
