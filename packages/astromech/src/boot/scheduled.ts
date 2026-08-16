/**
 * The scheduled entrypoint — the path a host reaches without going through the
 * fetch middleware, so it creates the application itself before ticking.
 */

import { createAstromech } from '@/boot/application';

/**
 * Cloudflare Worker entry calls this from its `scheduled()` handler:
 *   import { handleScheduled } from 'astromech/scheduler/cloudflare';
 *   export default { async scheduled(event) { await handleScheduled(event); } };
 */
export async function handleScheduled(event: { scheduledTime: number }): Promise<void> {
    // Loaded lazily so this module stays importable in plain Node, where
    // `virtual:` does not resolve: a config selecting `cloudflareCron()`
    // reaches here through the scheduler subpath, under jiti.
    const { rawConfig } = await import('virtual:astromech/config');
    const app = await createAstromech({ config: rawConfig });
    // A Cron Trigger is a dumb frequent ticker (`* * * * *`); the real cadence
    // is core's due-evaluation.
    await app.scheduled(new Date(event.scheduledTime));
}
