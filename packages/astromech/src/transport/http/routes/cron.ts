/**
 * CRON trigger route
 *
 * POST /cron/run — run a due-evaluation tick (only jobs whose stored schedule
 * is due fire). Auth: an admin session OR a shared-secret bearer token, so
 * external pollers (system crontab / serverless / uptime pingers) can drive the
 * scheduler on runtimes without an in-process timer. Mounts ahead of the
 * app-wide requireAuth (it enforces its own auth), so a sessionless bearer poke
 * is not pre-rejected.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { unauthorized } from '@/transport/http/middleware/errors';
import { getCurrentRole } from '@/request-context/index';
import { onTick } from '@/cron/runner';

const router = new OpenAPIHono();

/** Shared secret for non-session pokes. Undefined (off) until the env var is set. */
function cronSecret(): string | undefined {
    return typeof process !== 'undefined' ? process.env.ASTROMECH_CRON_SECRET : undefined;
}

// Not in a route table: no service method behind it, and its own auth — a
// bearer secret OR an admin session — which no contract permission can state.
router.post('/run', async (c) => {
    const secret = cronSecret();
    const authHeader = c.req.header('authorization');
    const bearerOk = secret !== undefined && authHeader === `Bearer ${secret}`;

    // Short-circuits: a bearer poke carries no session, so asking for a role
    // would resolve one nobody sent.
    if (!bearerOk && (await getCurrentRole())?.slug !== 'admin') return unauthorized(c);

    await onTick(new Date());
    return c.json({ success: true });
});

export { router as cronRouter };
