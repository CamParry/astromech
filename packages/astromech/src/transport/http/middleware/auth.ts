/**
 * Auth Middleware
 *
 * Attaches the current user + role to the Hono context. Identity itself is
 * resolved by the `users` domain (`resolveSessionUser`) and held in the
 * request-scoped context, so when the Astro middleware has already established
 * one this reuses it rather than resolving the same session a second time. When
 * nothing has (the Hono app mounted on its own), it resolves and establishes
 * the context itself.
 */

import { createMiddleware } from 'hono/factory';
import { resolveSessionUser } from '@/users/index.js';
import { getRequestContext, runWithContext } from '@/request-context/index.js';
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
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
    async (c, next) => {
        const existing = getRequestContext();
        if (existing?.user && existing.role) {
            c.set('user', existing.user);
            c.set('role', existing.role);
            return next();
        }

        const resolved = await resolveSessionUser(c.req.raw.headers);
        if (!resolved) {
            return unauthorized(c);
        }
        c.set('user', resolved.user);
        c.set('role', resolved.role);
        return runWithContext({ user: resolved.user, role: resolved.role }, () => next());
    }
);

/**
 * Resolve the session if present but never reject. Attaches `user`/`role` only
 * when a valid session exists. Used by routes (e.g. plugin RPC) that enforce
 * access per-method, including `public` methods.
 */
export const optionalAuth = createMiddleware<{ Variables: Partial<AuthVariables> }>(
    async (c, next) => {
        const existing = getRequestContext();
        if (existing?.user && existing.role) {
            c.set('user', existing.user);
            c.set('role', existing.role);
            return next();
        }

        const resolved = await resolveSessionUser(c.req.raw.headers);
        if (!resolved) {
            return next();
        }
        c.set('user', resolved.user);
        c.set('role', resolved.role);
        return runWithContext({ user: resolved.user, role: resolved.role }, () => next());
    }
);
