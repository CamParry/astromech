/**
 * The package name, as a literal. Exists only because `definePluginTable`
 * needs it as a *type* to derive `plugin_backups_*` table names for
 * `PluginDB`, which a value inside `index.ts`'s definition can't reach.
 */
export const BACKUPS_PACKAGE = '@astromech/backups';

/** The states a backup run moves through: `running`, then `success` or `failed`. */
export const BACKUP_RUN_STATUSES = ['running', 'success', 'failed'] as const;

/** What started a backup run: the cron schedule, a user, or a restore's safety copy. */
export const BACKUP_RUN_TRIGGERS = ['scheduled', 'manual', 'pre-restore'] as const;

export type BackupsOptions = {
    /** Cron schedule for automatic backups. Default: `'0 3 * * *'` (3 AM daily). */
    schedule?: string;
    /** Number of successful backup artifacts to retain. Default: `7`. */
    keep?: number;
};
