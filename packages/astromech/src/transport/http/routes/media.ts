/**
 * Media Routes
 *
 * File upload, listing, update, and delete.
 *
 * Routes:
 *   GET    /media            → all()
 *   GET    /media/:id        → get()
 *   GET    /media/:id/usage  → usedBy()
 *   POST   /media/upload     → upload()
 *   PUT    /media/:id        → update()
 *   DELETE /media/:id        → delete()
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { Astromech } from '@/transport/local/index.js';
import {
    badRequest,
    forbidden,
    fromZodError,
    notFound,
} from '@/transport/http/middleware/errors.js';
import type { AuthVariables } from '@/transport/http/middleware/auth.js';
import { permissionsFor } from '@/permissions/permissions-for.js';
import { updateMediaSchema } from '@/media/schema.js';
import { mediaDescriptors } from '@/media/methods.js';
import type { MediaQueryParams, JsonObject } from '@/types/index.js';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

/** Sort fields accepted off the wire. Mirrors the storage allowlist. */
const SORTABLE_FIELDS = new Set(['filename', 'mimeType', 'size', 'createdAt']);

// ============================================================================
// GET /media
// ============================================================================

router.get('/', async (c) => {
    const permissions = permissionsFor(c.var.role);
    if (!permissions.allowsMethod(mediaDescriptors.query)) return forbidden(c);

    const q = c.req.query();
    const params: MediaQueryParams = {};
    if (q['search']) params.search = q['search'];
    if (q['page']) params.page = Number(q['page']);
    if (q['limit'] === 'all') params.limit = 'all';
    else if (q['limit']) params.limit = Number(q['limit']);
    const mimeType = q['mimeType'];
    if (
        mimeType === 'images' ||
        mimeType === 'videos' ||
        mimeType === 'documents' ||
        mimeType === 'other'
    ) {
        params.where = { mimeType };
    }
    const sortField = q['sort'];
    if (sortField && SORTABLE_FIELDS.has(sortField)) {
        params.sort = { [sortField]: q['dir'] === 'asc' ? 'asc' : 'desc' };
    }
    return c.json(await Astromech.media.query(params));
});

// ============================================================================
// GET /media/:id
// ============================================================================

router.get('/:id', async (c) => {
    const { id } = c.req.param();
    const permissions = permissionsFor(c.var.role);
    if (!permissions.allowsMethod(mediaDescriptors.get)) return forbidden(c);

    const item = await Astromech.media.get({ id });
    if (!item) return notFound(c, `Media '${id}' not found`);
    return c.json({ data: item });
});

// ============================================================================
// GET /media/:id/usage
// ============================================================================

router.get('/:id/usage', async (c) => {
    const { id } = c.req.param();
    const permissions = permissionsFor(c.var.role);
    if (!permissions.allowsMethod(mediaDescriptors.usedBy)) return forbidden(c);

    const item = await Astromech.media.get({ id });
    if (!item) return notFound(c, `Media '${id}' not found`);

    const data = await Astromech.media.usedBy({ id });
    return c.json({ data });
});

// ============================================================================
// POST /media/upload
// ============================================================================

router.post('/upload', async (c) => {
    const permissions = permissionsFor(c.var.role);
    if (!permissions.allowsMethod(mediaDescriptors.upload)) return forbidden(c);

    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
        return badRequest(c, 'A file field is required');
    }

    const media = await Astromech.media.upload({ file });
    return c.json({ data: media }, 201);
});

// ============================================================================
// PUT /media/:id
// ============================================================================

router.put('/:id', async (c) => {
    const { id } = c.req.param();
    const permissions = permissionsFor(c.var.role);
    if (!permissions.allowsMethod(mediaDescriptors.update)) return forbidden(c);

    const raw = await c.req.json();
    const parsed = updateMediaSchema.safeParse(raw);
    if (!parsed.success) return fromZodError(c, parsed.error);

    const { alt, title, caption, fields } = parsed.data;
    const media = await Astromech.media.update({
        id,
        data: {
            ...(alt !== undefined && { alt }),
            ...(title !== undefined && { title }),
            ...(caption !== undefined && { caption }),
            ...(fields !== undefined && { fields: fields as JsonObject }),
        },
    });
    return c.json({ data: media });
});

// ============================================================================
// DELETE /media/:id
// ============================================================================

router.delete('/:id', async (c) => {
    const { id } = c.req.param();
    const permissions = permissionsFor(c.var.role);
    if (!permissions.allowsMethod(mediaDescriptors.delete)) return forbidden(c);

    await Astromech.media.delete({ id });
    return c.json({ success: true });
});

export { router as mediaRouter };
