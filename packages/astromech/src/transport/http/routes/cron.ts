/**
 * CRON trigger route
 *
 * POST /cron/run runs a due-evaluation tick, authorized by an admin session or
 * a shared-secret bearer token so external pollers can drive the scheduler.
 * GET /cron/run does the same for the bearer token alone, for schedulers that
 * send only a GET, such as Vercel Cron. Mounts ahead of the app-wide
 * requireAuth since it enforces its own auth.
 */

import type { Context } from 'hono';
import { OpenAPIHono } from '@hono/zod-openapi';
import { timingSafeEqual } from 'hono/utils/buffer';
import { currentAppContext, systemAppContext } from '@/app-context/app-context';
import { onTick } from '@/cron/runner';
import { resolveEnv } from '@/env';
import { unauthorized } from '@/transport/http/middleware/errors';

const router = new OpenAPIHono();

/** Shared secret for non-session pokes. Undefined (off) until the env var is set. */
function cronSecret(): string | undefined {
    return resolveEnv('ASTROMECH_CRON_SECRET');
}

/** Whether the request carries `Authorization: Bearer <ASTROMECH_CRON_SECRET>`. */
async function hasCronSecret(c: Context): Promise<boolean> {
    const secret = cronSecret();
    const authHeader = c.req.header('authorization');
    // Compared in constant time, so the response time leaks nothing of the secret.
    return (
        secret !== undefined &&
        authHeader !== undefined &&
        (await timingSafeEqual(authHeader, `Bearer ${secret}`))
    );
}

/** Run a tick and answer it. The jobs run as the system, not as whoever asked. */
async function tick(c: Context): Promise<Response> {
    await onTick(new Date(), systemAppContext());
    return c.json({ success: true });
}

// Not in a route table: no service method behind it, and its own auth — a
// bearer secret OR an admin session — which no contract permission can state.
router.post('/run', async (c) => {
    // Short-circuits: a bearer poke carries no session, so asking for a role
    // would resolve one nobody sent.
    if (!(await hasCronSecret(c)) && (await currentAppContext()).role?.slug !== 'admin') {
        return unauthorized(c);
    }
    return tick(c);
});

// The bearer secret only. A browser sends the session cookie with a GET that a
// link on another site starts, and Astro's origin check covers only unsafe
// methods, so a session never authorizes a GET.
router.get('/run', async (c) => {
    if (!(await hasCronSecret(c))) return unauthorized(c);
    return tick(c);
});

export { router as cronRouter };
