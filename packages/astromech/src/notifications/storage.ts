/**
 * Notification storage — the only place Kysely touches the `notifications` table.
 *
 * Thin domain vocabulary over `createStorage(notificationsTable)`, which owns encoding,
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
import { createStorage } from '@/database/storage/create-storage';
import { notificationsTable } from '@/database/tables';

export type NotificationStorage = ReturnType<typeof createNotificationStorage>;

/** Defaults to the registered db; pass a tx handle to scope it to a transaction. */
export function createNotificationStorage(db?: Db) {
    const storage = createStorage(notificationsTable, db);

    /** Insert one row per user in a single statement. */
    async function createMany(rows: NewNotificationRow[]): Promise<void> {
        if (rows.length === 0) return;
        const { db: handle, table } = storage.query();
        await handle
            .insertInto(table)
            .values(rows.map((row) => encodeWith(storage.table, row)))
            .execute();
    }

    /** A user's notifications, newest first. */
    async function listByUser(userId: string): Promise<NotificationRow[]> {
        return storage.findMany({
            where: { userId },
            orderBy: [['createdAt', 'desc']],
        });
    }

    async function countByUser(userId: string): Promise<number> {
        return storage.count({ userId });
    }

    /**
     * Dismiss one notification. Filtering on `userId` as well as `id` is the
     * authorization check — a user may only dismiss their own row.
     */
    async function dismiss(userId: string, id: string): Promise<void> {
        await storage.deleteMany({ id, userId });
    }

    async function dismissAll(userId: string): Promise<void> {
        await storage.deleteMany({ userId });
    }

    return { createMany, listByUser, countByUser, dismiss, dismissAll };
}
