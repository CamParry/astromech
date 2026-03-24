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

import { Hono } from 'hono';
import { z } from 'zod';
import { Astromech } from '@/sdk/server/index.js';
import { fromZodError, internalError, notFound } from '@/api/middleware/errors.js';
import type { AuthVariables } from '@/api/middleware/auth.js';

type Env = { Variables: AuthVariables };

const router = new Hono<Env>();

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
    z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null(),
        z.array(jsonValue),
        z.record(z.string(), jsonValue),
    ])
);

const putSchema = z.object({ value: jsonValue });

// ============================================================================
// GET /settings
// ============================================================================

router.get('/', async (c) => {
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

    try {
        const raw = await c.req.json();
        const parsed = putSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const setting = await Astromech.settings.set(key, parsed.data.value as import('@/types/index.js').JsonValue);
        return c.json({ data: setting });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as settingsRouter };
