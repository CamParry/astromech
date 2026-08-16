/**
 * CRON scheduling and handler.
 *
 * Import once during integration setup. Built-in job registration is handled
 * by the entries domain — see `@/entries/index.js`.
 */

import { ensureBooted } from '@/boot/ensure-booted';
import { onTick } from '@/cron/runner';

/**
 * Cloudflare Worker entry calls this from its `scheduled()` handler:
 *   import { handleScheduled } from 'astromech/scheduler/cloudflare';
 *   export default { async scheduled(event) { await handleScheduled(event); } };
 */
export async function handleScheduled(event: { scheduledTime: number }): Promise<void> {
    // A Cron Trigger fires `scheduled()`, never `fetch()`, so the middleware has
    // not run and this path boots the runtime itself. Triggers are a dumb
    // frequent ticker (`* * * * *`); real cadence is core's due-eval.
    await ensureBooted();
    await onTick(new Date(event.scheduledTime));
}

export { onTick, runDue, runScheduledJobs } from '@/cron/runner';
export { registerCronJob, getCronJobs } from '@/cron/registry';
export type { CronJob, CronContext } from '@/cron/registry';
