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

declare global {
    var __astromechRuntimeConfig: ResolvedConfig | undefined;
}

/**
 * Stash the resolved config at boot so the cron runner can read it WITHOUT
 * importing `virtual:astromech/config`. The node scheduler driver ticks in
 * plain Node (detached from any Vite request context), where `virtual:` does
 * not resolve — see the cron runner. globalThis-backed so the value set during
 * the integration's plain-Node boot is visible to the SSR module graph and the
 * detached timer alike.
 */
export function setRuntimeConfig(config: ResolvedConfig): void {
    globalThis.__astromechRuntimeConfig = config;
}

export function getRuntimeConfig(): ResolvedConfig {
    if (!globalThis.__astromechRuntimeConfig) {
        throw new Error(
            '[astromech/cron] Runtime config not set. initRuntime() must run before the scheduler ticks.'
        );
    }
    return globalThis.__astromechRuntimeConfig;
}
