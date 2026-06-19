/**
 * Notifications Routes
 *
 * Session-scoped — all operations use the authenticated user's id.
 * No permission descriptors; ownership enforced via userId in every query.
 *
 * Routes:
 *   GET    /notifications        → list
 *   GET    /notifications/count  → total count
 *   DELETE /notifications        → dismiss all
 *   DELETE /notifications/:id    → dismiss one
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { notificationsRepo, toNotification } from '@/notifications/index.js';
import { internalError } from '@/transport/http/middleware/errors.js';
import type { AuthVariables } from '@/transport/http/middleware/auth.js';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

// ============================================================================
// GET /notifications
// ============================================================================

router.get('/', async (c) => {
    const userId = c.var.user.id;
    try {
        const rows = await notificationsRepo.list(userId);
        return c.json({ data: rows.map(toNotification) });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /notifications/count
// ============================================================================

router.get('/count', async (c) => {
    const userId = c.var.user.id;
    try {
        const count = await notificationsRepo.count(userId);
        return c.json({ data: { count } });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// DELETE /notifications
// ============================================================================

router.delete('/', async (c) => {
    const userId = c.var.user.id;
    try {
        await notificationsRepo.dismissAll(userId);
        return new Response(null, { status: 204 });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// DELETE /notifications/:id
// ============================================================================

router.delete('/:id', async (c) => {
    const userId = c.var.user.id;
    const { id } = c.req.param();
    try {
        await notificationsRepo.dismiss(userId, id);
        return new Response(null, { status: 204 });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as notificationsRouter };
