/**
 * CRON trigger route
 *
 * POST /cron/run runs a due-evaluation tick, authorized by an admin session or
 * a shared-secret bearer token so external pollers can drive the scheduler.
 * Mounts ahead of the app-wide requireAuth since it enforces its own auth.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { currentAppContext, systemAppContext } from '@/app-context/app-context';
import { onTick } from '@/cron/runner';
import { resolveEnv } from '@/env';
import { unauthorized } from '@/transport/http/middleware/errors';

const router = new OpenAPIHono();

/** Shared secret for non-session pokes. Undefined (off) until the env var is set. */
function cronSecret(): string | undefined {
    return resolveEnv('ASTROMECH_CRON_SECRET');
}

// Not in a route table: no service method behind it, and its own auth — a
// bearer secret OR an admin session — which no contract permission can state.
router.post('/run', async (c) => {
    const secret = cronSecret();
    const authHeader = c.req.header('authorization');
    const bearerOk = secret !== undefined && authHeader === `Bearer ${secret}`;

    // Short-circuits: a bearer poke carries no session, so asking for a role
    // would resolve one nobody sent.
    if (!bearerOk && (await currentAppContext()).role?.slug !== 'admin') {
        return unauthorized(c);
    }

    // The jobs run as the system, not as the admin who asked for the tick.
    await onTick(new Date(), systemAppContext());
    return c.json({ success: true });
});

export { router as cronRouter };
