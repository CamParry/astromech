import type { Insertable } from 'kysely';
import type { NotificationRow } from './schema.js';
import { getDb } from '@/database/registry.js';
import type { DB } from '@/database/types.js';
import { encode, decode } from '@/database/codec.js';
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
    const db = getDb();

    let userIds: string[];

    if ('user' in input.target) {
        userIds = [input.target.user];
    } else if ('role' in input.target) {
        const rows = await db
            .selectFrom('users')
            .select('id')
            .where('roleSlug', '=', input.target.role)
            .execute();
        userIds = rows.map((r) => r.id);
    } else {
        const rows = await db.selectFrom('users').select('id').execute();
        userIds = rows.map((r) => r.id);
    }

    if (userIds.length === 0) return;

    await db
        .insertInto('notifications')
        .values(
            userIds.map(
                (userId) =>
                    encode('notifications', {
                        userId,
                        type: input.type,
                        title: input.title,
                        message: input.message,
                        href: input.href ?? null,
                    }) as unknown as Insertable<DB['notifications']>
            )
        )
        .execute();
}

// ============================================================================
// notificationsRepo — userId-explicit internal repository
// ============================================================================

export const notificationsRepo = {
    async list(userId: string): Promise<NotificationRow[]> {
        const db = getDb();
        const rows = await db
            .selectFrom('notifications')
            .selectAll()
            .where('userId', '=', userId)
            .orderBy('createdAt', 'desc')
            .execute();
        return rows.map((r) => decode('notifications', r) as unknown as NotificationRow);
    },

    async count(userId: string): Promise<number> {
        const db = getDb();
        const row = await db
            .selectFrom('notifications')
            .select((eb) => eb.fn.countAll<number>().as('c'))
            .where('userId', '=', userId)
            .executeTakeFirst();
        return Number(row?.c ?? 0);
    },

    async dismiss(userId: string, id: string): Promise<void> {
        const db = getDb();
        await db
            .deleteFrom('notifications')
            .where('id', '=', id)
            .where('userId', '=', userId)
            .execute();
    },

    async dismissAll(userId: string): Promise<void> {
        const db = getDb();
        await db.deleteFrom('notifications').where('userId', '=', userId).execute();
    },
};
