import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { usersTable } from '@/users/schema.js';

// ============================================================================
// Notifications Table
// ============================================================================

export const notificationsTable = sqliteTable(
    'notifications',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        userId: text('user_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        type: text('type').notNull(),
        title: text('title').notNull(),
        message: text('message').notNull(),
        href: text('href'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (t) => [index('notifications_user_created_idx').on(t.userId, t.createdAt)]
);

export type NotificationRow = typeof notificationsTable.$inferSelect;
export type NewNotificationRow = typeof notificationsTable.$inferInsert;
