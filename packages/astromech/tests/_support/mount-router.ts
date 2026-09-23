/**
 * Mount one HTTP router in isolation with an injected user + role.
 *
 * The same stub middleware every route test already writes by hand: Better Auth
 * sessions are out of scope, so `user` and `role` are set directly and the test
 * exercises the router's own permission checks, and the app's error handler,
 * against the real DB.
 */

import type { DB } from '@/database/types';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { Role, User } from '@/types/index';
import type { Context, Hono, Next } from 'hono';
import type { Kysely } from 'kysely';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createTestUser } from '@tests/harness';
import { currentAppContext } from '@/app-context/app-context';
import { runInRequestScope } from '@/request-scope/request-scope';
import { onError } from '@/transport/http/middleware/errors';

export type RouteEnv = { Variables: AuthVariables };

/**
 * The identity every mounted-router test acts as unless it says otherwise. No
 * `users` row backs it until {@link seedTestUser} inserts one.
 */
export const testUser = { id: 'u1', email: 'a@b.dev' } as unknown as User;

/**
 * Insert the `users` row for {@link testUser}. A route test whose route writes a
 * row referencing the acting user must call this after `createTestDb()`, or the
 * foreign key fails. Every entry create and update does, through `createdBy`
 * and `updatedBy`, as do version snapshots and preview tokens.
 */
export async function seedTestUser(db: Kysely<DB>): Promise<void> {
    await createTestUser(db, { id: testUser.id, email: testUser.email });
}

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
    // Seeds the request scope with the identity, and `c.var.ctx` with the
    // context built from it, as `requireAuth` does. A pre-filled user is what
    // keeps a session resolve from being attempted.
    const stub = (c: Context<RouteEnv>, next: Next): Promise<void> =>
        runInRequestScope({ request: c.req.raw, user, role }, async () => {
            c.set('ctx', await currentAppContext());
            await next();
        });
    // The real app's error handler, so a service throw is mapped here exactly as
    // it is in `transport/http/app.ts`.
    app.onError(onError);
    app.use(`${basePath}/*`, stub);
    app.use(basePath, stub);
    app.route(basePath, router);
    return app;
}
