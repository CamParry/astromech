/**
 * better-auth's sessions, accounts and verifications. These describe what its
 * adapter writes: ISO-8601 TEXT timestamps and its own ids. `users` stays in
 * `users/tables.ts`, because it is the user.
 */

import { defineTable } from '@/database/define-table';
import { usersTable } from '@/users/tables';

export const sessionsTable = defineTable('sessions', ({ col }) => ({
    id: col.id({ format: 'uuid' }),
    expiresAt: col.timestamp({ notNull: true }),
    token: col.text({ notNull: true, unique: true }),
    createdAt: col.timestamp({ notNull: true }),
    updatedAt: col.timestamp({ notNull: true }),
    ipAddress: col.text(),
    userAgent: col.text(),
    userId: col.reference(() => usersTable, { notNull: true, onDelete: 'cascade' }),
}));

export const accountsTable = defineTable('accounts', ({ col }) => ({
    id: col.id({ format: 'uuid' }),
    accountId: col.text({ notNull: true }),
    providerId: col.text({ notNull: true }),
    userId: col.reference(() => usersTable, { notNull: true, onDelete: 'cascade' }),
    accessToken: col.text(),
    refreshToken: col.text(),
    idToken: col.text(),
    accessTokenExpiresAt: col.timestamp(),
    refreshTokenExpiresAt: col.timestamp(),
    scope: col.text(),
    password: col.text(),
    createdAt: col.timestamp({ notNull: true }),
    updatedAt: col.timestamp({ notNull: true }),
}));

export const verificationsTable = defineTable('verifications', ({ col }) => ({
    id: col.id({ format: 'uuid' }),
    identifier: col.text({ notNull: true }),
    value: col.text({ notNull: true }),
    expiresAt: col.timestamp({ notNull: true }),
    createdAt: col.timestamp(),
    updatedAt: col.timestamp(),
}));
