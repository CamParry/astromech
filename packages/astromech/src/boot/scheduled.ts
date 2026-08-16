/**
 * The scheduled entrypoints — the paths a host reaches without going through
 * the fetch middleware, so they boot the runtime themselves before ticking.
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

/** @deprecated Back-compat shim — now a due-evaluation tick, not run-everything. */
export async function runScheduledJobs(): Promise<void> {
    // Boots first, because a caller reaching a tick this way (a Worker entry, a
    // script) has not been through the middleware.
    await ensureBooted();
    await onTick(new Date());
}
