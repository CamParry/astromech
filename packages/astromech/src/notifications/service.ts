import { eq, desc, and, sql } from 'drizzle-orm';
import { notificationsTable } from './schema.js';
import type { NotificationRow } from './schema.js';
import { usersTable } from '@/users/schema.js';
import { getDb } from '@/database/registry.js';
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
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.roleSlug, input.target.role));
        userIds = rows.map((r) => r.id);
    } else {
        const rows = await db.select({ id: usersTable.id }).from(usersTable);
        userIds = rows.map((r) => r.id);
    }

    if (userIds.length === 0) return;

    await db.insert(notificationsTable).values(
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
// notificationsRepo — userId-explicit internal repository
// ============================================================================

export const notificationsRepo = {
    async list(userId: string): Promise<NotificationRow[]> {
        const db = getDb();
        return db
            .select()
            .from(notificationsTable)
            .where(eq(notificationsTable.userId, userId))
            .orderBy(desc(notificationsTable.createdAt));
    },

    async count(userId: string): Promise<number> {
        const db = getDb();
        const rows = await db
            .select({ count: sql<number>`count(*)` })
            .from(notificationsTable)
            .where(eq(notificationsTable.userId, userId));
        return rows[0]?.count ?? 0;
    },

    async dismiss(userId: string, id: string): Promise<void> {
        const db = getDb();
        await db
            .delete(notificationsTable)
            .where(
                and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId))
            );
    },

    async dismissAll(userId: string): Promise<void> {
        const db = getDb();
        await db
            .delete(notificationsTable)
            .where(eq(notificationsTable.userId, userId));
    },
};
