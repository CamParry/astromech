/**
 * The package name, as a literal.
 *
 * Identity is declared in `index.ts` alongside the rest of the definition;
 * this const exists only because `definePluginTable` needs the package as a
 * *type* to derive `plugin_backups_*` table names for `PluginDB`, and a
 * value inside the definition can't reach a module-scope table. It is the
 * one thing in this package that names its identity outside `index.ts` — keep
 * it that way.
 */
export const BACKUPS_PACKAGE = '@astromech/backups';

export type BackupsOptions = {
    /** Cron schedule for automatic backups. Default: `'0 3 * * *'` (3 AM daily). */
    schedule?: string;
    /** Number of successful backup artifacts to retain. Default: `7`. */
    keep?: number;
};
