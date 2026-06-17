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
import { Astromech } from '@/transport/local/index.js';
import { resolveRole } from '@/policies/permissions/permissions.js';
import { unauthorized } from './errors.js';
import type { User, Role } from '@/types/index.js';

export type AuthVariables = {
    user: User;
    role: Role;
};

/**
 * Resolve the Better Auth session into a full user row + role, or null if there
 * is no valid session. Shared by `requireAuth` and `optionalAuth`.
 */
export async function resolveSessionUser(
    headers: Headers
): Promise<{ user: User; role: Role } | null> {
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return null;

    // Load the full user row (Better Auth session may not include custom fields)
    const db = getDb();
    const userRow = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, session.user.id))
        .get();

    if (!userRow) return null;

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

    return { user, role: resolveRole(Astromech.config, userRow.roleSlug) };
}

/**
 * Require an authenticated session.
 * Attaches `user` and `role` to context variables.
 * Returns 401 if no valid session is found.
 */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const resolved = await resolveSessionUser(c.req.raw.headers);
    if (!resolved) {
        return unauthorized(c);
    }
    c.set('user', resolved.user);
    c.set('role', resolved.role);
    return next();
});

/**
 * Resolve the session if present but never reject. Attaches `user`/`role` only
 * when a valid session exists. Used by routes (e.g. plugin RPC) that enforce
 * access per-method, including `public` methods.
 */
export const optionalAuth = createMiddleware<{ Variables: Partial<AuthVariables> }>(
    async (c, next) => {
        const resolved = await resolveSessionUser(c.req.raw.headers);
        if (resolved) {
            c.set('user', resolved.user);
            c.set('role', resolved.role);
        }
        return next();
    }
);
