/**
 * The redirects plugin's table, `plugin_redirects_redirects`: one rule per
 * `from` path, which the unique index enforces and `lookup` reads by.
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
    }),
    ({ index }) => [index('redirects_from_unique', ['from'], { unique: true })]
);

export type RedirectRow = TableSelect<typeof redirectsTable>;
export type NewRedirectRow = TableInsert<typeof redirectsTable>;
