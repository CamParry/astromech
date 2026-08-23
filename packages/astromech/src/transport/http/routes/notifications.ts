/**
 * Notifications Routes
 *
 * Session-scoped — every call names the authenticated user, and filtering on
 * that id is the authorization; the four methods declare `sessionScoped`
 * instead of a permission contract, and the scoped handle fills `userId`.
 */
import type { RestRoute } from './rest-route';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import { OpenAPIHono } from '@hono/zod-openapi';
import { notificationsContract } from '@/notifications/contract';
import { notificationsService } from '@/notifications/service';
import { NOTIFICATIONS_ROUTE_SPECS } from './http-routes.shared';
import { attachHandlers, documentBespokeRoutes, mountRestRoutes } from './rest-route';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

export const NOTIFICATIONS_ROUTES: RestRoute[] = attachHandlers(
    NOTIFICATIONS_ROUTE_SPECS,
    {
        'get /': { args: () => ({}) },
        'delete /': { args: () => ({}) },
        'delete /:id': { args: (c) => ({ id: c.req.param('id') }) },
    }
);

mountRestRoutes(router, notificationsContract, NOTIFICATIONS_ROUTES);
documentBespokeRoutes(router, notificationsContract, NOTIFICATIONS_ROUTE_SPECS);

// GET /notifications/count — bespoke
// Not in the table: the method returns a scalar, and the route wraps it as
// `{ data: { count } }` rather than the `{ data }` envelope.
router.get('/count', async (c) => {
    const userId = c.var.user.id;
    const count = await notificationsService.count({ userId });
    return c.json({ data: { count } });
});

export { router as notificationsRouter };
