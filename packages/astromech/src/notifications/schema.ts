import {
    defineTable,
    type TableSelect,
    type TableInsert,
} from '@/database/define-table.js';

export const notificationsTable = defineTable(
    'notifications',
    ({ col }) => ({
        id: col.id(),
        userId: col.reference('users', { notNull: true, onDelete: 'cascade' }),
        type: col.text({ notNull: true }),
        title: col.text({ notNull: true }),
        message: col.text({ notNull: true }),
        href: col.text(),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    }),
    ({ index }) => [index('notifications_user_created_idx', ['userId', 'createdAt'])]
);

export type NotificationRow = TableSelect<typeof notificationsTable>;
export type NewNotificationRow = TableInsert<typeof notificationsTable>;
