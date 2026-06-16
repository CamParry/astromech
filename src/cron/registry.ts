/**
 * CRON job registry.
 *
 * Uses globalThis so jobs registered during Astro's config:setup hook
 * are visible to the runner at request/scheduled event time.
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { ResolvedConfig, SchedulerDriver } from '@/types/index.js';

export type CronContext = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: LibSQLDatabase<any>;
    config: ResolvedConfig;
};

export type CronJob = {
    name: string;
    /**
     * Seed/default cadence written to the `_astromech_cron` table on first
     * boot. The table is the source of truth thereafter — this field is not
     * re-read on subsequent starts. Keep the field; do not change its type.
     */
    schedule?: string;
    handler: (ctx: CronContext) => Promise<void>;
};

declare global {
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

declare global {
    var __astromechScheduler: SchedulerDriver | undefined;
}

export function setSchedulerDriver(driver: SchedulerDriver): void {
    globalThis.__astromechScheduler = driver;
}

export function getSchedulerDriver(): SchedulerDriver | null {
    return globalThis.__astromechScheduler ?? null;
}
