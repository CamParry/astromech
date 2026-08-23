/**
 * Auth Middleware
 *
 * Attaches the current user + role to the Hono context, reading both from the
 * request scope the app's root middleware established.
 */

import type { Role, User } from '@/types/index';
import { createMiddleware } from 'hono/factory';
import { getCurrentRole, getCurrentUser } from '@/request-context/request-context';
import { unauthorized } from './errors';

export type AuthVariables = {
    user: User;
    role: Role;
};

/**
 * Require an authenticated session.
 * Attaches `user` and `role` to context variables.
 * Returns 401 if no valid session is found.
 */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
    async (c, next) => {
        const user = await getCurrentUser();
        const role = await getCurrentRole();
        if (user === null || role === null) {
            return unauthorized(c);
        }
        c.set('user', user);
        c.set('role', role);
        return next();
    }
);

/**
 * Resolve the session if present but never reject. Attaches `user`/`role` only
 * when a valid session exists. Used by routes (e.g. plugin RPC) that enforce
 * access per-method, including `public` methods.
 */
export const optionalAuth = createMiddleware<{ Variables: Partial<AuthVariables> }>(
    async (c, next) => {
        const user = await getCurrentUser();
        const role = await getCurrentRole();
        if (user === null || role === null) {
            return next();
        }
        c.set('user', user);
        c.set('role', role);
        return next();
    }
);
