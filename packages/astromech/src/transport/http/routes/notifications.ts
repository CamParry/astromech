/**
 * Notifications Routes
 *
 * Session-scoped — every call names the authenticated user, and filtering on
 * that id is the authorization. No permission contracts; the four methods
 * declare `sessionScoped` instead (`notifications/methods.ts`), and the scoped
 * handle fills `userId` from the request context.
 *
 * Routes:
 *   GET    /notifications        → notifications.list
 *   GET    /notifications/count  → notifications.count (bespoke)
 *   DELETE /notifications        → notifications.dismissAll
 *   DELETE /notifications/:id    → notifications.dismiss
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { notificationsService } from '@/notifications/index';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import { mountRestRoutes, type RestRoute } from './rest-route';
import { notificationsContract } from '@/notifications/methods';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

export const NOTIFICATIONS_ROUTES: RestRoute[] = [
    { verb: 'get', path: '/', id: 'notifications.list', args: () => ({}) },
    {
        verb: 'delete',
        path: '/',
        id: 'notifications.dismissAll',
        args: () => ({}),
        envelope: 'empty',
    },
    {
        verb: 'delete',
        path: '/:id',
        id: 'notifications.dismiss',
        args: (c) => ({ id: c.req.param('id') }),
        envelope: 'empty',
    },
];

mountRestRoutes(router, notificationsContract, NOTIFICATIONS_ROUTES);

// ============================================================================
// GET /notifications/count — bespoke
// ============================================================================

// Not in the table: the method returns a scalar, and the route wraps it as
// `{ data: { count } }` rather than the `{ data }` envelope.
router.get('/count', async (c) => {
    const userId = c.var.user.id;
    const count = await notificationsService.count({ userId });
    return c.json({ data: { count } });
});

export { router as notificationsRouter };
