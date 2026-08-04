/**
 * The backups plugin's table. `definePluginTable` owns the
 * `plugin_<namespace>_` prefix, so the table is declared with its bare name and
 * comes out as `plugin_backups_runs`.
 */

import { definePluginTable } from 'astromech';
import type { TableInsert, TableSelect } from 'astromech';
import { BACKUPS_PACKAGE } from '../types.js';

export const backupRunsTable = definePluginTable(BACKUPS_PACKAGE, 'runs', ({ col }) => ({
    id: col.id(),
    key: col.text(),
    status: col.enum(['running', 'success', 'failed'] as const, {
        notNull: true,
    }),
    trigger: col.enum(['scheduled', 'manual', 'pre-restore'] as const, {
        notNull: true,
    }),
    sizeBytes: col.integer(),
    error: col.text(),
    startedAt: col.timestamp({ notNull: true, defaultNow: true }),
    finishedAt: col.timestamp(),
    artifactDeletedAt: col.timestamp(),
}));

export type BackupRunRow = TableSelect<typeof backupRunsTable>;
export type NewBackupRunRow = TableInsert<typeof backupRunsTable>;
