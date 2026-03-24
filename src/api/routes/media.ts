/**
 * Media Routes
 *
 * File upload, listing, update, and delete.
 *
 * Routes:
 *   GET    /media         → all()
 *   GET    /media/:id     → get()
 *   POST   /media/upload  → upload()
 *   PUT    /media/:id     → update()
 *   DELETE /media/:id     → delete()
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { Astromech } from '@/sdk/server/index.js';
import { badRequest, fromZodError, internalError, notFound } from '@/api/middleware/errors.js';
import type { AuthVariables } from '@/api/middleware/auth.js';

type Env = { Variables: AuthVariables };

const router = new Hono<Env>();

const updateSchema = z.object({
    alt: z.string().optional(),
    title: z.string().optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// GET /media
// ============================================================================

router.get('/', async (c) => {
    try {
        const items = await Astromech.media.all();
        return c.json({ data: items });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /media/list
// ============================================================================

const listQuerySchema = z.object({
    search: z.string().optional(),
    type: z.enum(['all', 'images', 'videos', 'documents', 'other']).optional(),
    page: z.coerce.number().int().positive().optional(),
    perPage: z.coerce.number().int().positive().optional(),
});

router.get('/list', async (c) => {
    const raw = {
        search: c.req.query('search'),
        type: c.req.query('type'),
        page: c.req.query('page'),
        perPage: c.req.query('perPage'),
    };

    const parsed = listQuerySchema.safeParse(raw);
    if (!parsed.success) return fromZodError(c, parsed.error);

    try {
        const result = await Astromech.media.list(parsed.data);
        return c.json(result);
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /media/:id
// ============================================================================

router.get('/:id', async (c) => {
    const { id } = c.req.param();

    try {
        const item = await Astromech.media.get(id);
        if (!item) return notFound(c, `Media '${id}' not found`);
        return c.json({ data: item });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// POST /media/upload
// ============================================================================

router.post('/upload', async (c) => {
    try {
        const formData = await c.req.formData();
        const file = formData.get('file');

        if (!(file instanceof File)) {
            return badRequest(c, 'A file field is required');
        }

        const media = await Astromech.media.upload(file);
        return c.json({ data: media }, 201);
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// PUT /media/:id
// ============================================================================

router.put('/:id', async (c) => {
    const { id } = c.req.param();

    try {
        const raw = await c.req.json();
        const parsed = updateSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { alt, title, fields } = parsed.data;
        const media = await Astromech.media.update(id, {
            ...(alt !== undefined && { alt }),
            ...(title !== undefined && { title }),
            ...(fields !== undefined && { fields: fields as import('@/types/index.js').JsonObject }),
        });
        return c.json({ data: media });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// DELETE /media/:id
// ============================================================================

router.delete('/:id', async (c) => {
    const { id } = c.req.param();

    try {
        await Astromech.media.delete(id);
        return c.json({ success: true });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as mediaRouter };
