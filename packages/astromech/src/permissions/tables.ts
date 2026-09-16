/**
 * The roles table. RBAC is ours, not a better-auth model, so `roles` sits with
 * the rest of the permissions module.
 */

import type { TableInsert, TableSelect } from '@/database/define-table';
import { defineTable } from '@/database/define-table';

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
