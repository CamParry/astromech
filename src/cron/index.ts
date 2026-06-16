/**
 * Built-in CRON jobs registration.
 *
 * Import this once during integration setup to register built-in jobs.
 */

import { registerCronJob } from '@/cron/registry.js';
import { scheduledPublishJob } from '@/cron/jobs/scheduled-publish.js';
import { trashPurgeJob } from '@/cron/jobs/trash-purge.js';
import { onTick } from '@/cron/runner.js';

export function registerBuiltInCronJobs(): void {
    registerCronJob(scheduledPublishJob);
    registerCronJob(trashPurgeJob);
}

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
