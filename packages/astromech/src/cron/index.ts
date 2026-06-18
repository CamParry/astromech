/**
 * CRON scheduling and handler.
 *
 * Import once during integration setup. Built-in job registration is handled
 * by the entries domain — see `@/entries/index.js`.
 */

import { onTick } from '@/cron/runner.js';

/**
 * Cloudflare Worker entry calls this from its `scheduled()` handler:
 *   export default { async scheduled(event, env, ctx) { await handleScheduled(event); } }
 * Platform Cron Triggers are a dumb frequent ticker (set wrangler.toml cron to
 * a frequent cadence, e.g. `* * * * *`); real cadence is core's due-eval.
 */
export async function handleScheduled(event: { scheduledTime: number }): Promise<void> {
    await onTick(new Date(event.scheduledTime));
}

export { onTick, runDue, runScheduledJobs } from '@/cron/runner.js';
export { registerCronJob, getCronJobs } from '@/cron/registry.js';
export type { CronJob, CronContext } from '@/cron/registry.js';
