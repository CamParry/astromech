/**
 * Notifications Routes
 *
 * Session-scoped — every call names the authenticated user, and filtering on
 * that id is the authorization; the four methods declare `sessionScoped`
 * instead of a permission contract, and the scoped handle fills `userId`.
 */
import type { AuthVariables } from '@/transport/http/middleware/auth';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { notificationsDefinition } from '@/notifications/service';
import { NOTIFICATIONS_ROUTE_SPECS } from './http-routes';
import { mountRestRoutes } from './rest-route';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

const { catalogue } = notificationsDefinition;

mountRestRoutes(router, {
    catalogue,
    // `count` answers `{ data: { count } }`, below, not the scalar the method returns.
    documented: {
        ...catalogue,
        count: { ...catalogue.count, output: z.object({ count: z.number() }) },
    },
    specs: NOTIFICATIONS_ROUTE_SPECS,
});

// GET /notifications/count — bespoke
// Not in the table: the method returns a scalar, and the route wraps it as
// `{ data: { count } }` rather than the `{ data }` envelope.
router.get('/count', async (c) => {
    const count = await c.var.ctx.notifications.count();
    return c.json({ data: { count } });
});

export { router as notificationsRouter };
