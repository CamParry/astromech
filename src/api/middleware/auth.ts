/**
 * Auth Middleware
 *
 * Validates the Better Auth session and attaches the user to Hono context.
 */

import { createMiddleware } from 'hono/factory';
import { auth } from '@/auth/index.js';
import { unauthorized } from './errors.js';
import type { User } from '@/types/index.js';

export type AuthVariables = {
    user: User;
};

/**
 * Require an authenticated session. Attaches `user` to context variables.
 * Returns 401 if no valid session is found.
 */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const session = await auth.api.getSession({
        headers: c.req.raw.headers,
    });

    if (!session?.user) {
        return unauthorized(c);
    }

    c.set('user', session.user as User);
    await next();
});
