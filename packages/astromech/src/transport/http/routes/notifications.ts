/**
 * Notifications Routes
 *
 * Session-scoped — every call names the authenticated user, and filtering on
 * that id is the authorization. No permission contracts; the four methods
 * declare `sessionScoped` instead (`notifications/methods.ts`).
 *
 * Routes:
 *   GET    /notifications        → list
 *   GET    /notifications/count  → total count
 *   DELETE /notifications        → dismiss all
 *   DELETE /notifications/:id    → dismiss one
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { notificationsService } from '@/notifications/index';
import type { AuthVariables } from '@/transport/http/middleware/auth';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

// ============================================================================
// GET /notifications
// ============================================================================

router.get('/', async (c) => {
    const userId = c.var.user.id;
    return c.json({ data: await notificationsService.list({ userId }) });
});

// ============================================================================
// GET /notifications/count
// ============================================================================

router.get('/count', async (c) => {
    const userId = c.var.user.id;
    const count = await notificationsService.count({ userId });
    return c.json({ data: { count } });
});

// ============================================================================
// DELETE /notifications
// ============================================================================

router.delete('/', async (c) => {
    const userId = c.var.user.id;
    await notificationsService.dismissAll({ userId });
    return new Response(null, { status: 204 });
});

// ============================================================================
// DELETE /notifications/:id
// ============================================================================

router.delete('/:id', async (c) => {
    const userId = c.var.user.id;
    const { id } = c.req.param();
    await notificationsService.dismiss({ userId, id });
    return new Response(null, { status: 204 });
});

export { router as notificationsRouter };
