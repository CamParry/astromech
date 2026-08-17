/**
 * Astromech's Cloudflare Workers integration. It wraps the Astro adapter's
 * worker entry with a `scheduled()` handler, so a site exports both from one
 * file.
 *
 * @example
 * // the site's src/worker.ts
 * import astro from '@astrojs/cloudflare/entrypoints/server';
 * import { createWorkerEntry } from 'astromech/cloudflare';
 * export default createWorkerEntry(astro);
 */

import { createAstromech } from '@/boot/application';
import { cloudflareCron } from '@/cron/drivers/index';
import { setDefaultScheduler } from '@/cron/registry';

/** The Cron Trigger event, narrowed to the field the tick reads. */
export type ScheduledEvent = { scheduledTime: number };

/**
 * The Worker's exported handler. The generics carry the Astro adapter's own
 * `fetch` signature through, so the package needs no Cloudflare types.
 */
export type WorkerEntry<Args extends unknown[], Result> = {
    fetch: (...args: Args) => Result;
    scheduled: (event: ScheduledEvent) => Promise<void>;
};

/**
 * Build the Worker's `export default` from the Astro adapter's entry. `fetch`
 * is the adapter's, unchanged: its own worker runs the injected middleware,
 * which is what creates the application.
 */
export function createWorkerEntry<Args extends unknown[], Result>(astro: {
    fetch: (...args: Args) => Result;
}): WorkerEntry<Args, Result> {
    setDefaultScheduler(cloudflareCron);

    return {
        fetch: (...args: Args): Result => astro.fetch(...args),
        scheduled: async (event: ScheduledEvent): Promise<void> => {
            // Loaded lazily so this module stays importable in plain Node,
            // where `virtual:` does not resolve.
            const { rawConfig } = await import('virtual:astromech/config');
            const app = await createAstromech({ config: rawConfig });
            // A Cron Trigger is a dumb frequent ticker (`* * * * *`); the real
            // cadence is core's due-evaluation.
            await app.scheduled(new Date(event.scheduledTime));
        },
    };
}
