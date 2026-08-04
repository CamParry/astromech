/**
 * CRON job registry.
 *
 * globalThis-backed (see `@/utilities/registry.js`) so jobs registered during
 * Astro's config:setup hook are visible to the runner at request/scheduled
 * event time.
 */

import { createRegistry } from '@/utilities/registry.js';
import type { Kysely } from 'kysely';
import type { DB } from '@/database/types.js';
import type { ResolvedConfig, SchedulerDriver } from '@/types/index.js';

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
 * Stash the resolved config at boot so the cron runner can read it WITHOUT
 * importing `virtual:astromech/config`. The node scheduler driver ticks in
 * plain Node (detached from any Vite request context), where `virtual:` does
 * not resolve — see the cron runner. globalThis-backed so the value set during
 * the integration's plain-Node boot is visible to the SSR module graph and the
 * detached timer alike.
 */
const runtimeConfig = createRegistry<ResolvedConfig>('runtimeConfig', {
    hint: 'initRuntime() must run before the scheduler ticks.',
});

export const setRuntimeConfig = runtimeConfig.set;
export const getRuntimeConfig = runtimeConfig.get;
