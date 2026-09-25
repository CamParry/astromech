/**
 * Notification repository: the only place Kysely touches the
 * `notifications` table. `createMany` fans one notification out to every
 * targeted user in a single INSERT.
 */

import type { NewNotificationRow, NotificationRow } from './tables';
import { createRepository } from '@/database/repository/create-repository';
import { notificationsTable } from '@/database/tables';

export type NotificationRepository = ReturnType<typeof createNotificationRepository>;

function createNotificationRepository() {
    const repository = createRepository(notificationsTable);

    /** Insert one row per user in a single statement. */
    async function createMany(rows: NewNotificationRow[]): Promise<void> {
        await repository.createMany(rows);
    }

    /** A user's notifications, newest first. */
    async function findByUser(userId: string): Promise<NotificationRow[]> {
        return repository.findMany({
            where: { userId },
            orderBy: [['createdAt', 'desc']],
        });
    }

    async function countByUser(userId: string): Promise<number> {
        return repository.count({ userId });
    }

    /**
     * Delete one notification. Filtering on `userId` as well as `id` is the
     * authorization check: a user may only delete their own row.
     */
    async function del(where: { id: string; userId: string }): Promise<void> {
        await repository.deleteMany(where);
    }

    async function deleteByUser(userId: string): Promise<void> {
        await repository.deleteMany({ userId });
    }

    return { createMany, findByUser, countByUser, delete: del, deleteByUser };
}

/** The notification repository. Stateless: the db handle resolves per call. */
export const notificationRepository = createNotificationRepository();
