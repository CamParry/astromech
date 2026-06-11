/**
 * Drizzle table for the redirects plugin.
 *
 * Table name: plugin_redirects_redirects
 * Prefix plugin_redirects_ matches alias 'redirects' (last segment of
 * '@astromech/redirects'), satisfying assertPluginTablePrefixes.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const redirectsTable = sqliteTable('plugin_redirects_redirects', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    from: text('from').notNull(),
    to: text('to').notNull(),
    status: text('status').notNull().default('301'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
});

export type RedirectRow = typeof redirectsTable.$inferSelect;
export type NewRedirectRow = typeof redirectsTable.$inferInsert;
