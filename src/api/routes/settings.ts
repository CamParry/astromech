/**
 * Settings Routes
 *
 * Key-value settings read and write.
 *
 * Routes:
 *   GET  /settings         → all()
 *   GET  /settings/:key    → get()
 *   PUT  /settings/:key    → set()
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { Astromech } from '@/sdk/local/index.js';
import { forbidden, fromZodError, internalError, notFound } from '@/api/middleware/errors.js';
import type { AuthVariables } from '@/api/middleware/auth.js';
import { can } from '@/core/permissions.js';
import { setSettingSchema } from '@/schemas/settings.js';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

// ============================================================================
// GET /settings
// ============================================================================

router.get('/', async (c) => {
    const role = c.var.role;
    if (!can(role, 'settings:read')) return forbidden(c);

    try {
        const settings = await Astromech.settings.all();
        return c.json({ data: settings });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /settings/:key
// ============================================================================

router.get('/:key', async (c) => {
    const { key } = c.req.param();
    const role = c.var.role;
    if (!can(role, 'settings:read')) return forbidden(c);

    try {
        const value = await Astromech.settings.get(key);
        if (value === null) return notFound(c, `Setting '${key}' not found`);
        return c.json({ data: { key, value } });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// PUT /settings/:key
// ============================================================================

router.put('/:key', async (c) => {
    const { key } = c.req.param();
    const role = c.var.role;
    if (!can(role, 'settings:update')) return forbidden(c);

    try {
        const raw = await c.req.json();
        const parsed = setSettingSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const setting = await Astromech.settings.set(key, parsed.data.value as import('@/types/index.js').JsonValue);
        return c.json({ data: setting });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as settingsRouter };
