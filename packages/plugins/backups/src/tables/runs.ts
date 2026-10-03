/**
 * The backups plugin's table. `definePluginTable` owns the
 * `plugin_<namespace>_` prefix, so the table is declared with its bare name and
 * comes out as `plugin_backups_runs`.
 */

import type { TableInsert, TableSelect } from 'astromech';
import { definePluginTable } from 'astromech';
import { BACKUP_RUN_STATUSES, BACKUP_RUN_TRIGGERS, BACKUPS_PACKAGE } from '../types';

export const backupRunsTable = definePluginTable(BACKUPS_PACKAGE, 'runs', ({ col }) => ({
    id: col.id(),
    key: col.text(),
    status: col.enum(BACKUP_RUN_STATUSES, { notNull: true }),
    trigger: col.enum(BACKUP_RUN_TRIGGERS, { notNull: true }),
    sizeBytes: col.integer(),
    error: col.text(),
    startedAt: col.timestamp({ notNull: true, defaultNow: true }),
    finishedAt: col.timestamp(),
    artifactDeletedAt: col.timestamp(),
}));

export type BackupRunRow = TableSelect<typeof backupRunsTable>;
export type NewBackupRunRow = TableInsert<typeof backupRunsTable>;
