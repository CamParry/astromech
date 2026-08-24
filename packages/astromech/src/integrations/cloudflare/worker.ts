/**
 * Astromech's Cloudflare Workers entry. It wraps a framework's worker handler
 * with `scheduled()` and registers the Worker's environment, so a site exports
 * both handlers from one file.
 */

import type { AstromechConfig } from '@/types/index';
import { createAstromech } from '@/astromech';
import { cloudflareCron } from '@/cron/drivers/cloudflare';
import { setDefaultScheduler } from '@/cron/registry';
import { setEnvSource } from '@/env';

/** The Cron Trigger event, narrowed to the field the tick reads. */
export type ScheduledEvent = { scheduledTime: number };

/**
 * What a Worker hands its handlers: string vars and object bindings in one
 * object. Typed structurally so the package needs no Cloudflare types.
 */
export type WorkerEnv = Record<string, unknown>;

/** The Worker's `export default`. */
export type WorkerEntry = {
    fetch: (
        request: Request,
        env: WorkerEnv,
        ctx?: unknown
    ) => Response | Promise<Response>;
    scheduled: (event: ScheduledEvent, env: WorkerEnv, ctx?: unknown) => Promise<void>;
};

/**
 * Build the Worker's `export default` from a framework's server entry. `fetch`
 * is that entry's, unchanged: its own handler runs the middleware that creates
 * the application.
 */
export function createWorkerEntry(
    server: {
        fetch: (
            request: Request,
            env: WorkerEnv,
            ctx?: unknown
        ) => Response | Promise<Response>;
    },
    options: { config: AstromechConfig }
): WorkerEntry {
    setDefaultScheduler(cloudflareCron);

    return {
        fetch: (request, env, ctx) => {
            setEnvSource(env);
            return server.fetch(request, env, ctx);
        },
        scheduled: async (event, env): Promise<void> => {
            // A cron trigger fires `scheduled()` and never `fetch()`, so this
            // cannot assume a request has created the application.
            setEnvSource(env);
            const app = await createAstromech({ config: options.config });
            // The trigger is a dumb frequent ticker (`* * * * *`); the real
            // cadence is the runner's due-evaluation.
            await app.scheduled(new Date(event.scheduledTime));
        },
    };
}
