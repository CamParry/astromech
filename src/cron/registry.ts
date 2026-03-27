/**
 * CRON job registry.
 *
 * Uses globalThis so jobs registered during Astro's config:setup hook
 * are visible to the runner at request/scheduled event time.
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { ResolvedConfig } from '@/types/index.js';

export interface CronContext {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: LibSQLDatabase<any>;
    config: ResolvedConfig;
}

export interface CronJob {
    name: string;
    handler: (ctx: CronContext) => Promise<void>;
}

declare global {
    // eslint-disable-next-line no-var
    var __astromechCronJobs: CronJob[] | undefined;
}

export function registerCronJob(job: CronJob): void {
    if (!globalThis.__astromechCronJobs) {
        globalThis.__astromechCronJobs = [];
    }
    globalThis.__astromechCronJobs.push(job);
}

export function getCronJobs(): CronJob[] {
    return globalThis.__astromechCronJobs ?? [];
}
