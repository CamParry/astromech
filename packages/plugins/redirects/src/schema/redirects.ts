/**
 * Table descriptor for the redirects plugin. `definePlugin` owns the
 * `plugin_<alias>_` prefix, so the table is declared with its bare name and
 * comes out as `plugin_redirects_redirects`.
 */

import { definePlugin } from 'astromech/plugin-kit';
import type { TableInsert, TableSelect } from 'astromech/plugin-kit';

export const tables = definePlugin({
    alias: 'redirects',
    schema: ({ table }) => ({
        redirects: table('redirects', ({ col }) => ({
            id: col.id(),
            from: col.text({ notNull: true }),
            to: col.text({ notNull: true }),
            status: col.text({ notNull: true, default: '301' }),
            enabled: col.boolean({ notNull: true, default: true }),
            createdAt: col.timestamp({ notNull: true, defaultNow: true }),
            updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
        })),
    }),
});

export const redirectsTable = tables.redirects;

export type RedirectRow = TableSelect<typeof redirectsTable>;
export type NewRedirectRow = TableInsert<typeof redirectsTable>;
