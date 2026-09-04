import type { TableInsert, TableSelect } from '@/database/define-table';
import { defineTable } from '@/database/define-table';

/**
 * users table. better-auth writes it through its own Kysely instance, so the
 * descriptor describes its on-disk format rather than defining it.
 * `sessions`, `accounts` and `verifications` have no descriptor and stay hand-authored.
 */

export const usersTable = defineTable('users', ({ col }) => ({
    id: col.id({ format: 'uuid' }),
    email: col.text({ notNull: true, unique: true }),
    name: col.text({ notNull: true }),
    emailVerified: col.boolean({ notNull: true, default: false }),
    image: col.text(),
    /** json column — parsed; callers narrow it themselves. */
    fields: col.json(),
    /** No SQL default on purpose: `DEFAULT_ROLE_SLUG` is the default in code,
     *  and every write path supplies it. A path that forgets fails here
     *  rather than minting a role silently. */
    role: col.text({ notNull: true }),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
}));

export type UserRow = TableSelect<typeof usersTable>;

// roles table (defineTable) — RBAC is ours, not a better-auth model

export const rolesTable = defineTable('roles', ({ col }) => ({
    slug: col.text({ primaryKey: true }),
    name: col.text({ notNull: true }),
    permissions: col.json<string[]>({ notNull: true }),
    isBuiltIn: col.boolean({ notNull: true, default: false }),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
}));

export type RoleRow = TableSelect<typeof rolesTable>;
export type NewRoleRow = TableInsert<typeof rolesTable>;
