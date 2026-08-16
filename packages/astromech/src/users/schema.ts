import { z } from '@hono/zod-openapi';
import { defineTable, type TableSelect, type TableInsert } from '@/database/define-table';
import { DEFAULT_ROLE_SLUG } from '@/permissions/index';

// ============================================================================
// better-auth tables — users, sessions, accounts, verifications
//
// These 4 are NOT defined with `defineTable` by design: better-auth's adapter
// owns their legacy seconds-INTEGER timestamp format, so they are excluded from
// our `defineTable`-driven DDL/migration pipeline. They are hand-authored in the
// app's baseline migration (`apps/demo/migrations/0000_baseline.ts`) and
// hand-typed in their storage shape in `@/database/types.ts` — that file is the
// storage-shape authority. `UserRow` below is the *domain*-side view of the
// same table (post-codec: `Date` timestamps, `boolean` flags, parsed json), and
// must be kept in step with it by hand.
//
// `roles` is ours → `defineTable` below.
// ============================================================================

/** Domain shape of a `users` row, as returned by `decode('users', …)`. */
export type UserRow = {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image: string | null;
    /** json column — parsed; callers narrow it themselves. */
    fields: unknown;
    roleSlug: string;
    createdAt: Date;
    updatedAt: Date;
};

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
        // Defaulted here, not by the column: a create that names no role gets
        // the least-privileged built-in rather than whatever the DDL says.
        roleSlug: z.string().default(DEFAULT_ROLE_SLUG).openapi({ example: 'editor' }),
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

const sortDirection = z.enum(['asc', 'desc']);

/**
 * Call schema for `users.query` — mirrors `UserQueryParams`. Not a request body:
 * the HTTP route reads these off the query string, so this exists purely so the
 * method manifest can describe how the method is called.
 */
export const userQuerySchema = z.object({
    search: z.string().optional(),
    page: z.number().optional(),
    limit: z.union([z.number(), z.literal('all')]).optional(),
    sort: z
        .union([
            z.record(z.string(), sortDirection),
            z.array(z.record(z.string(), sortDirection)),
        ])
        .optional(),
});
