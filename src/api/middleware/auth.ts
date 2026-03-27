/**
 * Auth Middleware
 *
 * Validates the Better Auth session, loads the user's role from config,
 * and attaches both to the Hono context.
 */

import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth/index.js';
import { getDb } from '@/db/registry.js';
import { usersTable } from '@/db/schema.js';
import { Astromech } from '@/sdk/local/index.js';
import { resolveRole } from '@/core/permissions.js';
import { unauthorized } from './errors.js';
import type { User, Role } from '@/types/index.js';

export type AuthVariables = {
    user: User;
    role: Role;
};

/**
 * Require an authenticated session.
 * Attaches `user` and `role` to context variables.
 * Returns 401 if no valid session is found.
 */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const session = await auth.api.getSession({
        headers: c.req.raw.headers,
    });

    if (!session?.user) {
        return unauthorized(c);
    }

    // Load the full user row (Better Auth session may not include custom fields)
    const db = getDb();
    const userRow = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, session.user.id))
        .get();

    if (!userRow) {
        return unauthorized(c);
    }

    const user: User = {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        emailVerified: userRow.emailVerified,
        image: userRow.image ?? null,
        fields: (userRow.fields as User['fields']) ?? null,
        roleSlug: userRow.roleSlug,
        createdAt: userRow.createdAt,
        updatedAt: userRow.updatedAt,
    };

    const role = resolveRole(Astromech.config, userRow.roleSlug);

    c.set('user', user);
    c.set('role', role);
    return next();
});
