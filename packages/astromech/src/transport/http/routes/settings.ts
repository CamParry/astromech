/**
 * Settings Routes
 *
 * Key-value settings read and write.
 *
 * Routes:
 *   GET  /settings         → settings.all
 *   GET  /settings/:key    → settings.get (bespoke)
 *   PUT  /settings/:key    → settings.set
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { Astromech } from '@/transport/local/index';
import { forbidden, notFound } from '@/transport/http/middleware/errors';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import { permissionsFor } from '@/permissions/permissions-for';
import { settingsContract } from '@/settings/index';
import { mountRestRoutes, type RestRoute } from './rest-route';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

export const SETTINGS_ROUTES: RestRoute[] = [
    // `full: true`: an authenticated admin endpoint guarded by settings:read
    // returns the whole set, not just the public keys.
    { verb: 'get', path: '/', id: 'settings.all', args: () => ({ full: true }) },
    // The value is the body, the key is the path param — pinned last so a body
    // key cannot redirect the write.
    {
        verb: 'put',
        path: '/:key',
        id: 'settings.set',
        args: async (c) => ({
            ...(await c.req.json<Record<string, unknown>>()),
            key: c.req.param('key'),
        }),
    },
];

mountRestRoutes(router, settingsContract, SETTINGS_ROUTES);

// ============================================================================
// GET /settings/:key — bespoke
// ============================================================================

// Not in the table: `settings.get` returns the value alone, and the route
// re-attaches the path param as `{ data: { key, value } }`.
router.get('/:key', async (c) => {
    const { key } = c.req.param();
    const permissions = permissionsFor(c.var.role);
    if (!permissions.allowsMethod(settingsContract.get)) return forbidden(c);

    // Authenticated admin endpoint (guarded by settings:read): return the
    // full shape so private settings (e.g. plugin pages) are editable. The
    // the Client requests base + per-locale keys separately, so no locale
    // merge is needed here.
    const value = await Astromech.settings.get({ key, full: true });
    if (value === null) return notFound(c, `Setting '${key}' not found`);
    return c.json({ data: { key, value } });
});

export { router as settingsRouter };
