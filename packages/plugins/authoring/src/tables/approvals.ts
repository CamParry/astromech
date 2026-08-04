/**
 * Table descriptor for the authoring plugin's approvals. `definePluginTable`
 * owns the `plugin_<namespace>_` prefix, so the table is declared with its bare
 * name and comes out as `plugin_authoring_approvals`.
 */

import { definePluginTable } from 'astromech';
import type { TableInsert, TableSelect } from 'astromech';
import { AUTHORING_PACKAGE } from '../types.js';

export const approvalsTable = definePluginTable(
    AUTHORING_PACKAGE,
    'approvals',
    ({ col }) => ({
        id: col.id(),
        userId: col.text({ notNull: true }),
        toolUseId: col.text({ notNull: true }),
        /** Manifest method id, e.g. `entries.page.publish`. */
        method: col.text({ notNull: true }),
        /** How the tool is looked up in the surface when the turn resumes. */
        toolName: col.text({ notNull: true }),
        /** The arguments the call runs with — nulled out once resolved. */
        arguments: col.json<Record<string, unknown>>(),
        destructive: col.boolean({ notNull: true }),
        status: col.enum(['pending', 'approved', 'rejected', 'expired'] as const, {
            notNull: true,
        }),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        expiresAt: col.timestamp({ notNull: true }),
        resolvedAt: col.timestamp(),
    })
);

export type ApprovalRow = TableSelect<typeof approvalsTable>;
export type NewApprovalRow = TableInsert<typeof approvalsTable>;
