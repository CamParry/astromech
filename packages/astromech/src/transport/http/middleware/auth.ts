/**
 * Auth Middleware
 *
 * Attaches the request's `AppContext` to the Hono context as `c.var.ctx`, built
 * from the request scope the app's root middleware established.
 */

import type { AppContext } from '@/types/index';
import { createMiddleware } from 'hono/factory';
import { currentAppContext } from '@/app-context/app-context';
import { unauthorized } from './errors';

export type AuthVariables = {
    /** The context the request's calls run with: its user, role and services. */
    ctx: AppContext;
};

/**
 * Require an authenticated session: attach `ctx`, or answer 401 when the
 * request has no signed-in user with a role.
 */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
    async (c, next) => {
        const ctx = await currentAppContext();
        if (ctx.user === null || ctx.role === null) return unauthorized(c);
        c.set('ctx', ctx);
        return next();
    }
);

/**
 * Attach `ctx` whether or not a session exists. Used by routes (plugin RPC and
 * raw routes) that enforce access per method, `public` methods included.
 */
export const optionalAuth = createMiddleware<{ Variables: AuthVariables }>(
    async (c, next) => {
        c.set('ctx', await currentAppContext());
        return next();
    }
);
