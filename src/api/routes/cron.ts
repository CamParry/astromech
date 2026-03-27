/**
 * CRON trigger route
 *
 * POST /cron/run — manually trigger all scheduled CRON jobs.
 * Admin-only. Useful for non-Cloudflare runtimes or manual testing.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { forbidden, internalError } from '@/api/middleware/errors.js';
import type { AuthVariables } from '@/api/middleware/auth.js';
import { getCronJobs } from '@/cron/registry.js';
import { runScheduledJobs } from '@/cron/runner.js';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

router.post('/run', async (c) => {
    const role = c.var.role;
    if (role?.slug !== 'admin') return forbidden(c);

    try {
        const jobs = getCronJobs();
        await runScheduledJobs();
        return c.json({ success: true, jobs: jobs.length });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as cronRouter };
