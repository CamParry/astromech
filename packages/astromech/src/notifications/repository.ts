/**
 * Notification storage — the only place Kysely touches the `notifications` table.
 *
 * Thin domain vocabulary over `createRepository(notificationsTable)`, which owns encoding,
 * value serialization and row decoding. `createMany` is the one thing the wrapper
 * cannot express: `notify()` fans one notification out to every targeted user, and
 * the wrapper's `create` is single-row, so going through it would turn one INSERT
 * into N round-trips.
 *
 * The `users` lookups `notify()` needs live in `users/storage.ts` — they are that
 * table's rows, not this one's.
 */

import type { NewNotificationRow, NotificationRow } from './tables';
import type { Db } from '@/database/types';
import { encodeWith } from '@/database/codec';
import { createRepository } from '@/database/repository/create-repository';
import { notificationsTable } from '@/database/tables';

export type NotificationRepository = ReturnType<typeof createNotificationRepository>;

/** Defaults to the registered db; pass a tx handle to scope it to a transaction. */
export function createNotificationRepository(db?: Db) {
    const repository = createRepository(notificationsTable, db);

    /** Insert one row per user in a single statement. */
    async function createMany(rows: NewNotificationRow[]): Promise<void> {
        if (rows.length === 0) return;
        const { db: handle, table } = repository.query();
        await handle
            .insertInto(table)
            .values(rows.map((row) => encodeWith(repository.table, row)))
            .execute();
    }

    /** A user's notifications, newest first. */
    async function listByUser(userId: string): Promise<NotificationRow[]> {
        return repository.findMany({
            where: { userId },
            orderBy: [['createdAt', 'desc']],
        });
    }

    async function countByUser(userId: string): Promise<number> {
        return repository.count({ userId });
    }

    /**
     * Dismiss one notification. Filtering on `userId` as well as `id` is the
     * authorization check — a user may only dismiss their own row.
     */
    async function dismiss(userId: string, id: string): Promise<void> {
        await repository.deleteMany({ id, userId });
    }

    async function dismissAll(userId: string): Promise<void> {
        await repository.deleteMany({ userId });
    }

    return { createMany, listByUser, countByUser, dismiss, dismissAll };
}
