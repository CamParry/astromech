/**
 * Mount one HTTP router in isolation with an injected user + role.
 *
 * The same stub middleware every route test already writes by hand: Better Auth
 * sessions are out of scope, so `user` and `role` are set directly and the test
 * exercises the router's own permission checks against the real DB.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Hono, Next } from 'hono';
import { runWithContext } from '@/request-context/index';
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
    // Seeds the request scope as well as the context variables: a session-scoped
    // method takes its subject from the scope, and a pre-filled user is what
    // keeps a resolve from being attempted.
    const stub = (c: Context<RouteEnv>, next: Next): Promise<void> => {
        c.set('user', user);
        c.set('role', role);
        return runWithContext({ request: c.req.raw, user, role }, () => next());
    };
    app.use(`${basePath}/*`, stub);
    app.use(basePath, stub);
    app.route(basePath, router);
    return app;
}
