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

import { OpenAPIHono } from '@hono/zod-openapi';
import { eq, count } from 'drizzle-orm';
import { Astromech } from '@/sdk/local/index.js';
import { badRequest, forbidden, fromZodError, internalError, notFound } from '@/api/middleware/errors.js';
import type { AuthVariables } from '@/api/middleware/auth.js';
import { can } from '@/core/permissions.js';
import { getDb } from '@/db/registry.js';
import { usersTable } from '@/db/schema.js';
import { createUserSchema, updateUserSchema } from '@/schemas/users.js';
import type { UserQueryParams } from '@/types/index.js';

type Env = { Variables: AuthVariables };

const router = new OpenAPIHono<Env>();

// ============================================================================
// GET /users
// ============================================================================

const SORTABLE_FIELDS = new Set(['name', 'email', 'createdAt', 'updatedAt', 'roleSlug']);

router.get('/', async (c) => {
    const role = c.var.role;
    if (!can(role, 'users:read')) return forbidden(c);

    try {
        const q = c.req.query();
        const params: UserQueryParams = {};
        if (q['search']) params.search = q['search'];
        if (q['page']) params.page = Number(q['page']);
        if (q['limit'] === 'all') params.limit = 'all';
        else if (q['limit']) params.limit = Number(q['limit']);
        if (q['sort'] && SORTABLE_FIELDS.has(q['sort']!)) {
            const dir = q['dir'] === 'asc' ? 'asc' : 'desc';
            params.sort = { [q['sort']!]: dir };
        }
        return c.json(await Astromech.users.query(params));
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

// ============================================================================
// GET /users/:id
// ============================================================================

router.get('/:id', async (c) => {
    const { id } = c.req.param();
    const role = c.var.role;
    const currentUser = c.var.user;
    if (!can(role, 'users:read') && currentUser.id !== id) return forbidden(c);

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
    const role = c.var.role;
    if (!can(role, 'users:create')) return forbidden(c);

    try {
        const raw = await c.req.json();
        const parsed = createUserSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { email, name, fields, roleSlug } = parsed.data;
        const user = await Astromech.users.create({
            email,
            name,
            ...(fields !== undefined && { fields: fields as import('@/types/index.js').JsonObject }),
            ...(roleSlug !== undefined && { roleSlug }),
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
    const role = c.var.role;
    const currentUser = c.var.user;
    const canUpdateUsers = can(role, 'users:update');
    const isSelf = currentUser.id === id;

    if (!canUpdateUsers && !isSelf) return forbidden(c);

    try {
        const raw = await c.req.json();
        const parsed = updateUserSchema.safeParse(raw);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const { email, name, fields, roleSlug } = parsed.data;

        // Prevent self-role change or role change without users:update permission
        if (roleSlug !== undefined) {
            if (!canUpdateUsers) return forbidden(c);

            // Last-admin check: if changing away from 'admin', ensure it's not the last one
            const targetUser = await Astromech.users.get(id);
            if (targetUser && targetUser.roleSlug === 'admin' && roleSlug !== 'admin') {
                const db = getDb();
                const result = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.roleSlug, 'admin')).get();
                const adminCount = result?.count ?? 0;
                if (adminCount <= 1) {
                    return badRequest(c, 'Cannot remove the last administrator');
                }
            }
        }

        const user = await Astromech.users.update(id, {
            ...(email !== undefined && { email }),
            ...(name !== undefined && { name }),
            ...(fields !== undefined && { fields: fields as import('@/types/index.js').JsonObject }),
            ...(roleSlug !== undefined && { roleSlug }),
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
    const role = c.var.role;
    if (!can(role, 'users:delete')) return forbidden(c);

    try {
        // Last-admin check
        const targetUser = await Astromech.users.get(id);
        if (targetUser && targetUser.roleSlug === 'admin') {
            const db = getDb();
            const result = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.roleSlug, 'admin')).get();
            const adminCount = result?.count ?? 0;
            if (adminCount <= 1) {
                return badRequest(c, 'Cannot delete the last administrator');
            }
        }

        await Astromech.users.delete(id);
        return c.json({ success: true });
    } catch (err) {
        return internalError(c, err instanceof Error ? err.message : undefined);
    }
});

export { router as usersRouter };
