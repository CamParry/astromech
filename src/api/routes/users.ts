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
import { eq, count } from 'drizzle-orm';
import { Astromech } from '@/sdk/server/index.js';
import { badRequest, forbidden, fromZodError, internalError, notFound } from '@/api/middleware/errors.js';
import type { AuthVariables } from '@/api/middleware/auth.js';
import { can } from '@/core/permissions.js';
import { getDb } from '@/db/registry.js';
import { usersTable } from '@/db/schema.js';

type Env = { Variables: AuthVariables };

const router = new Hono<Env>();

const createSchema = z.object({
    email: z.string().email('Must be a valid email address'),
    name: z.string().min(1, 'Name is required'),
    fields: z.record(z.string(), z.unknown()).optional(),
    roleSlug: z.string().optional(),
});

const updateSchema = z.object({
    email: z.string().email('Must be a valid email address').optional(),
    name: z.string().min(1, 'Name cannot be empty').optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
    roleSlug: z.string().optional(),
});

// ============================================================================
// GET /users
// ============================================================================

router.get('/', async (c) => {
    const role = c.var.role;
    if (!can(role, 'users:read')) return forbidden(c);

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
        const parsed = createSchema.safeParse(raw);
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
        const parsed = updateSchema.safeParse(raw);
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
