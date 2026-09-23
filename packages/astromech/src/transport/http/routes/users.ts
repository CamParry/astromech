/**
 * Users Routes
 *
 * CRUD operations for CMS users.
 */
import type { RestRoute } from './rest-route';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { SortDirection, UserQueryParams, UserUpdateData } from '@/types/index';
import type { Context } from 'hono';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { permissionsFor } from '@/permissions/permissions-for';
import {
    badRequest,
    forbidden,
    fromZodError,
    notFound,
} from '@/transport/http/middleware/errors';
import { usersDefinition } from '@/users/service';
import { USERS_ROUTE_SPECS } from './http-routes';
import {
    attachHandlers,
    documentBespokeRoutes,
    isMethodInputError,
    mountRestRoutes,
} from './rest-route';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

/** Sort fields accepted off the wire. An unlisted one is dropped, not rejected. */
const SORTABLE_FIELDS = new Set(['name', 'email', 'createdAt', 'updatedAt', 'role']);

/** The query string the list route accepts. `dir` is the only one that can fail. */
const listQuery = z.object({
    locale: z.string().optional(),
    search: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
    sort: z.string().optional(),
    dir: z.enum(['asc', 'desc']).optional(),
});

export const USERS_ROUTES: RestRoute[] = attachHandlers(USERS_ROUTE_SPECS, {
    'get /': { args: queryArgs, query: listQuery },
    'post /': {
        args: async (c) => ({ data: await c.req.json<Record<string, unknown>>() }),
    },
    'delete /:id': { args: (c) => ({ id: c.req.param('id') ?? '' }) },
    'get /:id/versions': { args: contentArgs },
    'post /:id/versions/:versionId/restore': {
        args: (c) => ({ ...contentArgs(c), versionId: c.req.param('versionId') ?? '' }),
    },
});

mountRestRoutes(router, usersDefinition.catalogue, USERS_ROUTES);
documentBespokeRoutes(router, usersDefinition.catalogue, USERS_ROUTE_SPECS);

/**
 * The `{ id }` a user route addresses, plus the locale a content-level one
 * names. An absent locale leaves the service to fill in the default.
 */
function contentArgs(c: Context<Env>): { id: string; locale?: string } {
    const locale = c.req.query('locale');
    return { id: c.req.param('id') ?? '', ...(locale ? { locale } : {}) };
}

/** `users.query` arguments, read off the query string. */
function queryArgs(c: Context<Env>): UserQueryParams {
    const q = c.req.query();
    const params: UserQueryParams = {};
    if (q['locale']) params.locale = q['locale'];
    if (q['search']) params.search = q['search'];
    if (q['page']) params.page = Number(q['page']);
    if (q['limit'] === 'all') params.limit = 'all';
    else if (q['limit']) params.limit = Number(q['limit']);
    const sortField = q['sort'];
    // `dir` is already 'asc' or 'desc' — the route schema 400s anything else.
    if (sortField && SORTABLE_FIELDS.has(sortField)) {
        params.sort = { [sortField]: (q['dir'] as SortDirection | undefined) ?? 'desc' };
    }
    return params;
}

// GET /users/:id — bespoke
// Not in the table: self-access. A caller reading its own row passes without
// `users:read`, which no method contract can state.
router.get('/:id', async (c) => {
    const { ctx } = c.var;
    const args = contentArgs(c);
    if (
        !permissionsFor(ctx.role).allowsMethod(usersDefinition.catalogue.get) &&
        ctx.user?.id !== args.id
    )
        return forbidden(c);

    const user = await ctx.users.get(args);
    if (!user) return notFound(c, `User '${args.id}' not found`);
    return c.json({ data: user });
});

// PUT /users/:id — bespoke
// Not in the table: self-access, and a `role` change that still demands
// `users:update`. The method parses the body and guards the last admin; its
// input failure is reported under the wire's names, as the table's routes do.
router.put('/:id', async (c) => {
    const { id, locale } = contentArgs(c);
    const permissions = permissionsFor(c.var.ctx.role);
    const canUpdateUsers = permissions.allowsMethod(usersDefinition.catalogue.update);
    const isSelf = c.var.ctx.user?.id === id;

    if (!canUpdateUsers && !isSelf) return forbidden(c);

    const raw = await c.req.json<unknown>().catch(() => undefined);
    if (raw === undefined) return badRequest(c, 'Invalid JSON body');
    const changesRole =
        typeof raw === 'object' &&
        raw !== null &&
        (raw as { role?: unknown }).role !== undefined;
    if (changesRole && !canUpdateUsers) return forbidden(c);

    try {
        const user = await c.var.ctx.users.update({
            id,
            ...(locale ? { locale } : {}),
            data: raw as UserUpdateData,
        });
        return c.json({ data: user });
    } catch (error) {
        if (isMethodInputError(error)) return fromZodError(c, error, 'data');
        throw error;
    }
});

export { router as usersRouter };
