/**
 * The users tables. `users` is better-auth's account row, so the descriptor
 * describes its on-disk format rather than defining it. `user_content` holds one
 * row per locale of what the site's own fields say, and `user_versions` snapshots one.
 */

import type { TableInsert, TableSelect } from '@/database/define-table';
import { defineTable } from '@/database/define-table';

export const usersTable = defineTable('users', ({ col }) => ({
    id: col.id({ format: 'uuid' }),
    email: col.text({ notNull: true, unique: true }),
    name: col.text({ notNull: true }),
    emailVerified: col.boolean({ notNull: true, default: false }),
    image: col.text(),
    /** No SQL default on purpose: `DEFAULT_ROLE_SLUG` is the default in code,
     *  and every write path supplies it. A path that forgets fails here
     *  rather than minting a role silently. */
    role: col.text({ notNull: true }),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
}));

export const userContentTable = defineTable(
    'user_content',
    ({ col }) => ({
        id: col.id(),
        userId: col.reference(() => usersTable, {
            notNull: true,
            onDelete: 'cascade',
        }),
        locale: col.text({ notNull: true }),
        fields: col.json(),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
        createdBy: col.reference('users', { onDelete: 'set null' }),
        updatedBy: col.reference('users', { onDelete: 'set null' }),
    }),
    ({ index }) => [
        index('idx_user_content_user', ['userId']),
        index('user_content_user_locale_unique', ['userId', 'locale'], {
            unique: true,
        }),
    ]
);

export const userVersionsTable = defineTable(
    'user_versions',
    ({ col }) => ({
        id: col.id(),
        contentId: col.reference(() => userContentTable, {
            notNull: true,
            onDelete: 'cascade',
        }),
        version: col.integer({ notNull: true }),
        fields: col.json(),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        createdBy: col.reference('users', { onDelete: 'set null' }),
    }),
    ({ index }) => [index('idx_user_versions_content', ['contentId', 'version'])]
);

export type UserTableRow = TableSelect<typeof usersTable>;
export type NewUserTableRow = TableInsert<typeof usersTable>;

export type UserContentRow = TableSelect<typeof userContentTable>;
export type NewUserContentRow = TableInsert<typeof userContentTable>;

export type UserVersionRow = TableSelect<typeof userVersionsTable>;
export type NewUserVersionRow = TableInsert<typeof userVersionsTable>;
