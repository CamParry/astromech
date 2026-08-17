/**
 * CRON job registry.
 *
 * globalThis-backed (see `@/utilities/registry.js`) so a job registered through
 * one entry chunk is visible to the runner reached through another.
 */

import { createRegistry } from '@/utilities/registry';
import { interval } from '@/cron/drivers/interval';
import type { Kysely } from 'kysely';
import type { DB } from '@/database/types';
import type { ResolvedConfig, SchedulerDriver } from '@/types/index';

export type CronContext = {
    db: Kysely<DB>;
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

const jobs = createRegistry<CronJob[]>('cronJobs', { required: false });

export function registerCronJob(job: CronJob): void {
    const list = jobs.peek() ?? [];
    list.push(job);
    jobs.set(list);
}

export function getCronJobs(): CronJob[] {
    return jobs.peek() ?? [];
}

const scheduler = createRegistry<SchedulerDriver>('scheduler', { required: false });

export const setSchedulerDriver = scheduler.set;
export const getSchedulerDriver = scheduler.peek;

/**
 * The driver factory an integration nominates for a config naming no scheduler.
 * A registry slot rather than a module-level variable because the Cloudflare
 * worker entry ships as its own tsup chunk (`dist/cloudflare/index.js`) and boot
 * ships in another, so the two copies would not share a plain variable.
 */
const defaultScheduler = createRegistry<() => SchedulerDriver>('defaultScheduler', {
    required: false,
});

export const setDefaultScheduler = defaultScheduler.set;

/** The config's driver, else the integration's default, else the in-process ticker. */
export function resolveSchedulerDriver(configured?: SchedulerDriver): SchedulerDriver {
    return configured ?? defaultScheduler.peek()?.() ?? interval();
}
