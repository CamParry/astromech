import type { TableInsert, TableSelect } from '@/database/define-table';
import { defineTable } from '@/database/define-table';

// ============================================================================
// users table (defineTable)
//
// better-auth's adapter writes this table through its own Kysely instance, so it
// owns the on-disk FORMAT: TEXT ids (better-auth mints its own; `format: 'uuid'`
// is what OUR writes mint), ISO-8601 TEXT timestamps, INTEGER 0/1 booleans, TEXT
// json. The descriptor DESCRIBES that format rather than changing
// it — `tests/db/baseline-ddl-parity.test.ts` is the proof the two agree — which
// is what lets our DDL, codec and storage be generated from it like any other
// table. `sessions`, `accounts` and `verifications` have no descriptor: nothing
// of ours writes them, so they stay hand-authored in the app's baseline.
// ============================================================================

export const usersTable = defineTable('users', ({ col }) => ({
    id: col.id({ format: 'uuid' }),
    email: col.text({ notNull: true, unique: true }),
    name: col.text({ notNull: true }),
    emailVerified: col.boolean({ notNull: true, default: false }),
    image: col.text(),
    /** json column — parsed; callers narrow it themselves. */
    fields: col.json(),
    /** No SQL default on purpose: `DEFAULT_ROLE_SLUG` is the default in code, and
     *  every write path supplies it (better-auth signup through
     *  `user.additionalFields`, the users service through its zod schema). A path
     *  that forgets fails here rather than minting a role silently. */
    roleSlug: col.text({ notNull: true }),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
}));

export type UserRow = TableSelect<typeof usersTable>;

// ============================================================================
// roles table (defineTable) — RBAC is ours, not a better-auth model
// ============================================================================

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
