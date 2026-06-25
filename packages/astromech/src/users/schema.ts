import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { z } from '@hono/zod-openapi';
import {
    defineTable,
    type TableSelect,
    type TableInsert,
} from '@/database/define-table.js';

// ============================================================================
// Drizzle tables — users, sessions, accounts, verifications (better-auth).
// These 4 stay on Drizzle/seconds-INTEGER (better-auth's adapter + harness use
// them). `roles` is ours → defineTable descriptor below.
// ============================================================================

export const usersTable = sqliteTable('users', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    emailVerified: integer('email_verified', { mode: 'boolean' })
        .notNull()
        .default(false),
    image: text('image'),
    fields: text('fields', { mode: 'json' }),
    roleSlug: text('role_slug').notNull().default('admin'),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
});

export const sessionsTable = sqliteTable('sessions', {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
});

export const accountsTable = sqliteTable('accounts', {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const verificationsTable = sqliteTable('verifications', {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// ============================================================================
// roles descriptor (defineTable) — RBAC is ours, not a better-auth model
// ============================================================================

export const roles = defineTable('roles', ({ col }) => ({
    slug: col.text({ primaryKey: true }),
    name: col.text({ notNull: true }),
    permissions: col.json<string[]>({ notNull: true }),
    isBuiltIn: col.boolean({ notNull: true, default: false }),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
}));

export type RoleRow = TableSelect<typeof roles>;
export type NewRoleRow = TableInsert<typeof roles>;

export type UserRow = typeof usersTable.$inferSelect;
export type NewUserRow = typeof usersTable.$inferInsert;

export type SessionRow = typeof sessionsTable.$inferSelect;
export type NewSessionRow = typeof sessionsTable.$inferInsert;

export type AccountRow = typeof accountsTable.$inferSelect;
export type NewAccountRow = typeof accountsTable.$inferInsert;

export type VerificationRow = typeof verificationsTable.$inferSelect;
export type NewVerificationRow = typeof verificationsTable.$inferInsert;

// ============================================================================
// Zod schemas
// ============================================================================

export const createUserSchema = z
    .object({
        email: z
            .string()
            .email('Must be a valid email address')
            .openapi({ example: 'user@example.com' }),
        name: z.string().min(1, 'Name is required').openapi({ example: 'Jane Doe' }),
        fields: z.record(z.string(), z.unknown()).optional(),
        roleSlug: z.string().optional().openapi({ example: 'editor' }),
    })
    .openapi('CreateUser');

export const updateUserSchema = z
    .object({
        email: z.string().email('Must be a valid email address').optional(),
        name: z.string().min(1, 'Name cannot be empty').optional(),
        fields: z.record(z.string(), z.unknown()).optional(),
        roleSlug: z.string().optional(),
    })
    .openapi('UpdateUser');
