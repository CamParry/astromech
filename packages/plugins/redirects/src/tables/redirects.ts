/**
 * The redirects plugin's table. `definePluginTable` owns the
 * `plugin_<namespace>_` prefix, so the table is declared with its bare name and
 * comes out as `plugin_redirects_redirects`.
 */

import type { TableInsert, TableSelect } from 'astromech';
import { definePluginTable } from 'astromech';
import { REDIRECTS_PACKAGE } from '../types';

export const redirectsTable = definePluginTable(
    REDIRECTS_PACKAGE,
    'redirects',
    ({ col }) => ({
        id: col.id(),
        from: col.text({ notNull: true }),
        to: col.text({ notNull: true }),
        status: col.text({ notNull: true, default: '301' }),
        enabled: col.boolean({ notNull: true, default: true }),
        createdAt: col.timestamp({ notNull: true, defaultNow: true }),
        updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
    })
);

export type RedirectRow = TableSelect<typeof redirectsTable>;
export type NewRedirectRow = TableInsert<typeof redirectsTable>;
