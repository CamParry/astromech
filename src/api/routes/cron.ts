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
import { internalError, unauthorized } from '@/api/middleware/errors.js';
import { resolveSessionUser } from '@/api/middleware/auth.js';
import { onTick } from '@/cron/runner.js';

const router = new OpenAPIHono();

/** Shared secret for non-session pokes. Undefined (off) until the env var is set. */
function cronSecret(): string | undefined {
    return typeof process !== 'undefined' ? process.env.ASTROMECH_CRON_SECRET : undefined;
}

router.post('/run', async (c) => {
    const secret = cronSecret();
    const authHeader = c.req.header('authorization');
    const bearerOk = secret !== undefined && authHeader === `Bearer ${secret}`;

    let sessionOk = false;
    if (!bearerOk) {
        const resolved = await resolveSessionUser(c.req.raw.headers);
        sessionOk = resolved?.role.slug === 'admin';
    }

    if (!bearerOk && !sessionOk) return unauthorized(c);

    try {
        await onTick(new Date());
        return c.json({ success: true });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as cronRouter };
