export type BackupsOptions = {
    /** Cron schedule for automatic backups. Default: `'0 3 * * *'` (3 AM daily). */
    schedule?: string;
    /** Number of successful backup artifacts to retain. Default: `7`. */
    keep?: number;
};
