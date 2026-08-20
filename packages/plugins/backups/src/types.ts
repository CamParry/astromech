/**
 * The package name, as a literal. Exists only because `definePluginTable`
 * needs it as a *type* to derive `plugin_backups_*` table names for
 * `PluginDB`, which a value inside `index.ts`'s definition can't reach.
 */
export const BACKUPS_PACKAGE = '@astromech/backups';

export type BackupsOptions = {
    /** Cron schedule for automatic backups. Default: `'0 3 * * *'` (3 AM daily). */
    schedule?: string;
    /** Number of successful backup artifacts to retain. Default: `7`. */
    keep?: number;
};
