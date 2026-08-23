/**
 * CRON job registry.
 *
 * globalThis-backed (see `@/registry.js`) so a job registered through
 * one entry chunk is visible to the runner reached through another.
 */

import type { DB } from '@/database/types';
import type { ResolvedConfig, SchedulerDriver } from '@/types/index';
import type { Kysely } from 'kysely';
import { interval } from '@/cron/drivers/interval';
import { isWorkersRuntime } from '@/env/index';
import { AstromechError } from '@/errors/index';
import { createRegistry } from '@/registry';

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
    const list = jobs.get() ?? [];
    list.push(job);
    jobs.set(list);
}

export function getCronJobs(): CronJob[] {
    return jobs.get() ?? [];
}

const scheduler = createRegistry<SchedulerDriver>('scheduler', { required: false });

export const setSchedulerDriver = scheduler.set;
export const getSchedulerDriver = scheduler.get;

/**
 * The driver factory an integration nominates for a config naming no
 * scheduler. A registry, not a module variable, because the Cloudflare
 * worker entry ships as its own tsup chunk from boot.
 */
const defaultScheduler = createRegistry<() => SchedulerDriver>('defaultScheduler', {
    required: false,
});

export const setDefaultScheduler = defaultScheduler.set;

/** The config's driver, else the integration's default, else the in-process ticker. */
export function resolveSchedulerDriver(configured?: SchedulerDriver): SchedulerDriver {
    const chosen = configured ?? defaultScheduler.get()?.();
    if (chosen !== undefined) return chosen;

    // A Worker isolate cannot own a timer, so falling through to the ticker
    // there would hand it a scheduler that never fires.
    if (isWorkersRuntime()) {
        throw new AstromechError(
            'No scheduler is selected and the in-process ticker cannot run in a Worker. ' +
                'Build the Worker entry with createWorkerEntry() from astromech/cloudflare, ' +
                'or name cloudflareCron() or webhook() as `scheduler` in your config.'
        );
    }
    return interval();
}
