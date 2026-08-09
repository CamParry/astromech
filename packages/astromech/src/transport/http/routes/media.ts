/**
 * Media Routes
 *
 * File upload, listing, replace, update, and delete.
 *
 * Routes:
 *   GET    /media              → media.query
 *   GET    /media/:id          → media.get
 *   GET    /media/:id/usage    → media.usedBy (bespoke)
 *   POST   /media/upload       → media.upload (bespoke)
 *   POST   /media/:id/replace  → media.replace (bespoke)
 *   PUT    /media/:id          → media.update
 *   DELETE /media/:id          → media.delete
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { Astromech } from '@/transport/local/index';
import { badRequest, forbidden, notFound } from '@/transport/http/middleware/errors';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import { permissionsFor } from '@/permissions/permissions-for';
import { mediaContract } from '@/media/methods';
import type { MediaQueryParams } from '@/types/index';
import { mountRestRoutes, type RestRoute } from './rest-route';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

/** Sort fields accepted off the wire. Mirrors the storage allowlist. */
const SORTABLE_FIELDS = new Set(['filename', 'mimeType', 'size', 'createdAt']);

const MEDIA_ROUTES: RestRoute[] = [
    { verb: 'get', path: '/', id: 'media.query', args: queryArgs, envelope: 'raw' },
    {
        verb: 'get',
        path: '/:id',
        id: 'media.get',
        args: (c) => ({ id: c.req.param('id') }),
        notFound: (c) => `Media '${c.req.param('id')}' not found`,
    },
    {
        verb: 'put',
        path: '/:id',
        id: 'media.update',
        args: async (c) => ({
            id: c.req.param('id'),
            data: await c.req.json<Record<string, unknown>>(),
        }),
    },
    {
        verb: 'delete',
        path: '/:id',
        id: 'media.delete',
        args: (c) => ({ id: c.req.param('id') }),
        envelope: 'success',
    },
];

mountRestRoutes(router, mediaContract, MEDIA_ROUTES);

/** `media.query` arguments, read off the query string. */
function queryArgs(c: Context<Env>): MediaQueryParams {
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
    return params;
}

// ============================================================================
// GET /media/:id/usage — bespoke
// ============================================================================

// Not in the table: it pre-flights `media.get` to turn an unknown id into a
// 404, so one handler makes two method calls.
router.get('/:id/usage', async (c) => {
    const { id } = c.req.param();
    const permissions = permissionsFor(c.var.role);
    if (!permissions.allowsMethod(mediaContract.usedBy)) return forbidden(c);

    const item = await Astromech.media.get({ id });
    if (!item) return notFound(c, `Media '${id}' not found`);

    const data = await Astromech.media.usedBy({ id });
    return c.json({ data });
});

// ============================================================================
// POST /media/upload — bespoke
// ============================================================================

// Not in the table: `binaryInput`. The body is multipart and a `File` has no
// JSON representation, so no contract schema can validate the call.
router.post('/upload', async (c) => {
    const permissions = permissionsFor(c.var.role);
    if (!permissions.allowsMethod(mediaContract.upload)) return forbidden(c);

    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
        return badRequest(c, 'A file field is required');
    }

    const media = await Astromech.media.upload({ file });
    return c.json({ data: media }, 201);
});

// ============================================================================
// POST /media/:id/replace — bespoke
// ============================================================================

// Not in the table: `binaryInput`, plus the same `media.get` pre-flight.
router.post('/:id/replace', async (c) => {
    const { id } = c.req.param();
    const permissions = permissionsFor(c.var.role);
    if (!permissions.allowsMethod(mediaContract.replace)) return forbidden(c);

    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
        return badRequest(c, 'A file field is required');
    }

    // The service throws for an unknown id, which would surface as a 500.
    const item = await Astromech.media.get({ id });
    if (!item) return notFound(c, `Media '${id}' not found`);

    const media = await Astromech.media.replace({ id, file });
    return c.json({ data: media });
});

export { router as mediaRouter };
