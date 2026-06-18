/**
 * Drizzle table for the backups plugin. The `plugin_{alias}_` prefix
 * (`TABLE_PREFIX`) namespaces it to satisfy `assertPluginTablePrefixes`.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { TABLE_PREFIX } from '../manifest.js';

export const backupRunsTable = sqliteTable(`${TABLE_PREFIX}runs`, {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    key: text('key'),
    status: text('status').notNull().$type<'running' | 'success' | 'failed'>(),
    trigger: text('trigger').notNull().$type<'scheduled' | 'manual' | 'pre-restore'>(),
    sizeBytes: integer('size_bytes'),
    error: text('error'),
    startedAt: integer('started_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
    artifactDeletedAt: integer('artifact_deleted_at', { mode: 'timestamp' }),
});

export type BackupRunRow = typeof backupRunsTable.$inferSelect;
export type NewBackupRunRow = typeof backupRunsTable.$inferInsert;
