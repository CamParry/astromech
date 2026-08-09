/**
 * Mount one HTTP router in isolation with an injected user + role.
 *
 * The same stub middleware every route test already writes by hand: Better Auth
 * sessions are out of scope, so `user` and `role` are set directly and the test
 * exercises the router's own permission checks against the real DB.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { Hono } from 'hono';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { Role, User } from '@/types/index';

export type RouteEnv = { Variables: AuthVariables };

/** The identity every mounted-router test acts as unless it says otherwise. */
export const testUser = { id: 'u1', email: 'a@b.dev' } as unknown as User;

/** A role holding exactly `permissions`. */
export function roleWith(permissions: string[]): Role {
    return {
        slug: 'test',
        name: 'Test',
        permissions: permissions as Role['permissions'],
        isBuiltIn: false,
    };
}

/** An admin role — the `*` matcher, so every permission check passes. */
export const adminRole: Role = {
    slug: 'admin',
    name: 'Administrator',
    permissions: ['*'] as Role['permissions'],
    isBuiltIn: true,
};

/**
 * Mount `router` at `basePath` behind a stub that injects `role` (and `user`,
 * defaulting to {@link testUser}).
 */
export function mountRouter(
    basePath: string,
    router: OpenAPIHono<RouteEnv> | Hono<RouteEnv>,
    role: Role,
    user: User = testUser
): OpenAPIHono<RouteEnv> {
    const app = new OpenAPIHono<RouteEnv>();
    app.use(`${basePath}/*`, async (c, next) => {
        c.set('user', user);
        c.set('role', role);
        return next();
    });
    app.use(basePath, async (c, next) => {
        c.set('user', user);
        c.set('role', role);
        return next();
    });
    app.route(basePath, router);
    return app;
}
