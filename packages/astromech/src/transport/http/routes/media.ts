/**
 * Media Routes
 *
 * File upload, listing, replace, update, and delete.
 */
import type { RestRoute } from './rest-route';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { MediaQueryParams, SortDirection } from '@/types/index';
import type { Context } from 'hono';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { mediaContract } from '@/media/contract';
import { mediaService } from '@/media/index';
import { permissionsFor } from '@/permissions/permissions-for';
import { badRequest, forbidden, notFound } from '@/transport/http/middleware/errors';
import { MEDIA_ROUTE_SPECS } from './http-routes.shared';
import { attachHandlers, documentBespokeRoutes, mountRestRoutes } from './rest-route';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

/** Sort fields accepted off the wire. Mirrors the repository allowlist. */
const SORTABLE_FIELDS = new Set(['filename', 'mimeType', 'size', 'createdAt']);

/** The query string the list route accepts. `dir` is the only one that can fail. */
const listQuery = z.object({
    search: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
    mimeType: z.string().optional(),
    sort: z.string().optional(),
    dir: z.enum(['asc', 'desc']).optional(),
});

export const MEDIA_ROUTES: RestRoute[] = attachHandlers(MEDIA_ROUTE_SPECS, {
    'get /': { args: queryArgs, query: listQuery },
    'get /:id': {
        args: (c) => ({ id: c.req.param('id') }),
        notFound: (c) => `Media '${c.req.param('id')}' not found`,
    },
    'put /:id': {
        args: async (c) => ({
            id: c.req.param('id'),
            data: await c.req.json<Record<string, unknown>>(),
        }),
    },
    'delete /:id': { args: (c) => ({ id: c.req.param('id') }) },
});

mountRestRoutes(router, mediaContract, MEDIA_ROUTES);
documentBespokeRoutes(router, mediaContract, MEDIA_ROUTE_SPECS);

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
    // `dir` is already 'asc' or 'desc' — the route schema 400s anything else.
    if (sortField && SORTABLE_FIELDS.has(sortField)) {
        params.sort = { [sortField]: (q['dir'] as SortDirection | undefined) ?? 'desc' };
    }
    return params;
}

// GET /media/:id/usage — bespoke
// Not in the table: it pre-flights `media.get` to turn an unknown id into a
// 404, so one handler makes two method calls.
router.get('/:id/usage', async (c) => {
    const { id } = c.req.param();
    const permissions = permissionsFor(c.var.role);
    if (!permissions.allowsMethod(mediaContract.usedBy)) return forbidden(c);

    const item = await mediaService.get({ id });
    if (!item) return notFound(c, `Media '${id}' not found`);

    const data = await mediaService.usedBy({ id });
    return c.json({ data });
});

// POST /media/upload — bespoke
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

    const media = await mediaService.upload({ file });
    return c.json({ data: media }, 201);
});

// POST /media/:id/replace — bespoke
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
    const item = await mediaService.get({ id });
    if (!item) return notFound(c, `Media '${id}' not found`);

    const media = await mediaService.replace({ id, file });
    return c.json({ data: media });
});

export { router as mediaRouter };
