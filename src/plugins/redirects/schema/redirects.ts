/**
 * Drizzle table for the redirects plugin. The `plugin_{alias}_` prefix
 * (`TABLE_PREFIX`) namespaces it to satisfy `assertPluginTablePrefixes`.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { TABLE_PREFIX } from '../manifest.js';

export const redirectsTable = sqliteTable(`${TABLE_PREFIX}redirects`, {
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
