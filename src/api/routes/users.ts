/**
 * Users Routes
 *
 * CRUD operations for CMS users.
 *
 * Routes:
 *   GET    /users         → all()
 *   GET    /users/:id     → get()
 *   POST   /users         → create()
 *   PUT    /users/:id     → update()
 *   DELETE /users/:id     → delete()
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { Astromech } from '@/sdk/server/index.js';
import { fromZodError, internalError, notFound } from '@/api/middleware/errors.js';
import type { AuthVariables } from '@/api/middleware/auth.js';

type Env = { Variables: AuthVariables };

const router = new Hono<Env>();

const createSchema = z.object({
    email: z.string().email('Must be a valid email address'),
    name: z.string().min(1, 'Name is required'),
    fields: z.record(z.string(), z.unknown()).optional(),
});

const updateSchema = z.object({
    email: z.string().email('Must be a valid email address').optional(),
    name: z.string().min(1, 'Name cannot be empty').optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// GET /users
// ============================================================================

router.get('/', async (c) => {
    try {
        const users = await Astromech.users.all();
        return c.json({ data: users });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /users/:id
// ============================================================================

router.get('/:id', async (c) => {
    const { id } = c.req.param();

    try {
        const user = await Astromech.users.get(id);
        if (!user) return notFound(c, `User '${id}' not found`);
        return c.json({ data: user });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /users
// ============================================================================

router.post('/', async (c) => {
    try {
        const raw = await c.req.json();
        const parsed = createSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { email, name, fields } = parsed.data;
        const user = await Astromech.users.create({
            email,
            name,
            ...(fields !== undefined && { fields: fields as import('@/types/index.js').JsonObject }),
        });
        return c.json({ data: user }, 201);
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// PUT /users/:id
// ============================================================================

router.put('/:id', async (c) => {
    const { id } = c.req.param();

    try {
        const raw = await c.req.json();
        const parsed = updateSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { email, name, fields } = parsed.data;
        const user = await Astromech.users.update(id, {
            ...(email !== undefined && { email }),
            ...(name !== undefined && { name }),
            ...(fields !== undefined && { fields: fields as import('@/types/index.js').JsonObject }),
        });
        return c.json({ data: user });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// DELETE /users/:id
// ============================================================================

router.delete('/:id', async (c) => {
    const { id } = c.req.param();

    try {
        await Astromech.users.delete(id);
        return c.json({ success: true });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as usersRouter };
