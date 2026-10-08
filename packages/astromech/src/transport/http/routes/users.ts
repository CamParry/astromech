/**
 * Users Routes
 *
 * CRUD operations for CMS users.
 */
import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { UserUpdateData } from '@/users/service-types';
import { OpenAPIHono } from '@hono/zod-openapi';
import { permissionsFor } from '@/permissions/permissions-for';
import {
    badRequest,
    forbidden,
    fromZodError,
    notFound,
} from '@/transport/http/middleware/errors';
import { usersDefinition } from '@/users/service';
import { USERS_ROUTE_SPECS } from './http-routes';
import { isMethodInputError, mountRestRoutes } from './rest-route';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

mountRestRoutes(router, {
    catalogue: usersDefinition.catalogue,
    specs: USERS_ROUTE_SPECS,
});

// GET /users/:id — bespoke
// Not in the table: self-access. A caller reading its own row passes without
// `users:read`, which no method contract can state.
router.get('/:id', async (c) => {
    const { ctx } = c.var;
    const id = c.req.param('id');
    const locale = c.req.query('locale');
    if (
        !permissionsFor(ctx.role).allowsMethod(usersDefinition.catalogue.get) &&
        ctx.user?.id !== id
    )
        return forbidden(c);

    const user = await ctx.users.get({ id, ...(locale ? { locale } : {}) });
    if (!user) return notFound(c, `User '${id}' not found`);
    return c.json({ data: user });
});

// PUT /users/:id — bespoke
// Not in the table: self-access, and a `role` or `email` change that still
// demands `users:update`. The method parses the body and guards the last admin;
// its input failure is reported under the wire's names, as the table's routes do.
router.put('/:id', async (c) => {
    const id = c.req.param('id');
    const locale = c.req.query('locale');
    const permissions = permissionsFor(c.var.ctx.role);
    const canUpdateUsers = permissions.allowsMethod(usersDefinition.catalogue.update);
    const isSelf = c.var.ctx.user?.id === id;

    if (!canUpdateUsers && !isSelf) return forbidden(c);

    const raw = await c.req.json<unknown>().catch(() => undefined);
    if (raw === undefined) return badRequest(c, 'Invalid JSON body');
    const body = typeof raw === 'object' && raw !== null ? raw : {};
    if (!canUpdateUsers && 'role' in body && body.role !== undefined)
        return forbidden(c, 'Changing your role requires the "users:update" permission');
    // A stolen session could change the email and then reset the password, so
    // self-access cannot change it until the change asks for the password.
    if (!canUpdateUsers && 'email' in body && body.email !== undefined)
        return forbidden(c, 'Changing your email requires the "users:update" permission');

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
