/**
 * Users Routes
 *
 * CRUD operations for CMS users.
 *
 * Routes:
 *   GET    /users         → users.query
 *   GET    /users/:id     → users.get (bespoke)
 *   POST   /users         → users.create
 *   PUT    /users/:id     → users.update (bespoke)
 *   DELETE /users/:id     → users.delete (bespoke)
 */

import { OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { usersService } from '@/users/index';
import {
    badRequest,
    forbidden,
    fromZodError,
    notFound,
} from '@/transport/http/middleware/errors';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import { permissionsFor } from '@/permissions/permissions-for';
import { updateUserSchema, usersContract } from '@/users/index';
import { createUserStorage } from '@/users/storage';
import type { JsonObject, SortDirection, UserQueryParams } from '@/types/index';
import { USERS_ROUTE_SPECS } from './http-routes.shared';
import {
    attachHandlers,
    documentBespokeRoutes,
    mountRestRoutes,
    type RestRoute,
} from './rest-route';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

/** Sort fields accepted off the wire. An unlisted one is dropped, not rejected. */
const SORTABLE_FIELDS = new Set(['name', 'email', 'createdAt', 'updatedAt', 'roleSlug']);

/** The query string the list route accepts. `dir` is the only one that can fail. */
const listQuery = z.object({
    search: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
    sort: z.string().optional(),
    dir: z.enum(['asc', 'desc']).optional(),
});

export const USERS_ROUTES: RestRoute[] = attachHandlers(USERS_ROUTE_SPECS, {
    'get /': { args: queryArgs, query: listQuery },
    'post /': { args: (c) => c.req.json<Record<string, unknown>>() },
});

mountRestRoutes(router, usersContract, USERS_ROUTES);
documentBespokeRoutes(router, usersContract, USERS_ROUTE_SPECS);

/** `users.query` arguments, read off the query string. */
function queryArgs(c: Context<Env>): UserQueryParams {
    const q = c.req.query();
    const params: UserQueryParams = {};
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

// ============================================================================
// GET /users/:id — bespoke
// ============================================================================

// Not in the table: self-access. A caller reading its own row passes without
// `users:read`, which no method contract can state.
router.get('/:id', async (c) => {
    const { id } = c.req.param();
    const permissions = permissionsFor(c.var.role);
    const currentUser = c.var.user;
    if (!permissions.allowsMethod(usersContract.get) && currentUser.id !== id)
        return forbidden(c);

    const user = await usersService.get({ id });
    if (!user) return notFound(c, `User '${id}' not found`);
    return c.json({ data: user });
});

// ============================================================================
// PUT /users/:id — bespoke
// ============================================================================

// Not in the table: self-access, a `roleSlug` change that still demands
// `users:update`, and the last-admin guard — which is a second storage call.
router.put('/:id', async (c) => {
    const { id } = c.req.param();
    const permissions = permissionsFor(c.var.role);
    const currentUser = c.var.user;
    const canUpdateUsers = permissions.allowsMethod(usersContract.update);
    const isSelf = currentUser.id === id;

    if (!canUpdateUsers && !isSelf) return forbidden(c);

    const raw = await c.req.json();
    const parsed = updateUserSchema.safeParse(raw);
    if (!parsed.success) return fromZodError(c, parsed.error);

    const { email, name, fields, roleSlug } = parsed.data;

    // Prevent self-role change or role change without users:update permission
    if (roleSlug !== undefined) {
        if (!canUpdateUsers) return forbidden(c);

        // Last-admin check: if changing away from 'admin', ensure it's not the last one
        const targetUser = await usersService.get({ id });
        if (targetUser && targetUser.roleSlug === 'admin' && roleSlug !== 'admin') {
            const adminCount = await createUserStorage().countByRole('admin');
            if (adminCount <= 1) {
                return badRequest(c, 'Cannot remove the last administrator');
            }
        }
    }

    const user = await usersService.update({
        id,
        data: {
            ...(email !== undefined && { email }),
            ...(name !== undefined && { name }),
            ...(fields !== undefined && { fields: fields as JsonObject }),
            ...(roleSlug !== undefined && { roleSlug }),
        },
    });
    return c.json({ data: user });
});

// ============================================================================
// DELETE /users/:id — bespoke
// ============================================================================

// Not in the table: the last-admin guard, a second storage call no contract
// can state.
router.delete('/:id', async (c) => {
    const { id } = c.req.param();
    const permissions = permissionsFor(c.var.role);
    if (!permissions.allowsMethod(usersContract.delete)) return forbidden(c);

    // Last-admin check
    const targetUser = await usersService.get({ id });
    if (targetUser && targetUser.roleSlug === 'admin') {
        const adminCount = await createUserStorage().countByRole('admin');
        if (adminCount <= 1) {
            return badRequest(c, 'Cannot delete the last administrator');
        }
    }

    await usersService.delete({ id });
    return c.json({ success: true });
});

export { router as usersRouter };
