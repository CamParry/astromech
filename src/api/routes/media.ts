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

import { OpenAPIHono } from '@hono/zod-openapi';
import { Astromech } from '@/sdk/local/index.js';
import { badRequest, forbidden, fromZodError, internalError, notFound } from '@/api/middleware/errors.js';
import type { AuthVariables } from '@/api/middleware/auth.js';
import { can } from '@/core/permissions.js';
import { updateMediaSchema } from '@/schemas/media.js';
import type { MediaQueryParams } from '@/types/index.js';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

// ============================================================================
// GET /media
// ============================================================================

router.get('/', async (c) => {
    const role = c.var.role;
    if (!can(role, 'media:read')) return forbidden(c);

    try {
        const q = c.req.query();
        const params: MediaQueryParams = {};
        if (q['search']) params.search = q['search'];
        if (q['page']) params.page = Number(q['page']);
        if (q['limit'] === 'all') params.limit = 'all';
        else if (q['limit']) params.limit = Number(q['limit']);
        const mimeType = q['mimeType'];
        if (mimeType === 'images' || mimeType === 'videos' || mimeType === 'documents' || mimeType === 'other') {
            params.where = { mimeType };
        }
        return c.json(await Astromech.media.query(params));
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /media/:id
// ============================================================================

router.get('/:id', async (c) => {
    const { id } = c.req.param();
    const role = c.var.role;
    if (!can(role, 'media:read')) return forbidden(c);

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
    const role = c.var.role;
    if (!can(role, 'media:upload')) return forbidden(c);

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
    const role = c.var.role;
    if (!can(role, 'media:upload')) return forbidden(c);

    try {
        const raw = await c.req.json();
        const parsed = updateMediaSchema.safeParse(raw);
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
    const role = c.var.role;
    if (!can(role, 'media:delete')) return forbidden(c);

    try {
        await Astromech.media.delete(id);
        return c.json({ success: true });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as mediaRouter };
