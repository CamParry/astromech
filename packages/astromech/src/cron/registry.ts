/**
 * CRON job registry.
 *
 * globalThis-backed (see `@/utilities/registry.js`) so a job registered through
 * one entry chunk is visible to the runner reached through another.
 */

import { createRegistry } from '@/utilities/registry';
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
 * Stash the resolved config at boot so readers that cannot import
 * `virtual:astromech/config` still reach it: the cron runner, and better-auth's
 * base path in `users/auth.ts`. `boot/astro.ts` → `boot/boot.js` →
 * `cron/runner.js` puts the runner in the plain-Node graph Astro loads at
 * `astro:config:setup`, where a static `virtual:` import throws
 * `ERR_UNSUPPORTED_ESM_URL_SCHEME` during Astro's own config load.
 */
const runtimeConfig = createRegistry<ResolvedConfig>('runtimeConfig', {
    hint: 'initRuntime() must run first.',
});

export const setRuntimeConfig = runtimeConfig.set;
export const getRuntimeConfig = runtimeConfig.get;
