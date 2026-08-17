/**
 * Astromech API — the Hono root app.
 *
 * Built once from the resolved config, so every route registers at the absolute
 * path it is served on and `app.fetch` takes a request unchanged.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { requireAuth } from './middleware/auth';
import type { AuthVariables } from './middleware/auth';
import { onError, onNotFound } from './middleware/errors';
import { entriesRouter } from './routes/entries';
import { usersRouter } from './routes/users';
import { mediaRouter } from './routes/media';
import { settingsRouter } from './routes/settings';
import { entryTypesRouter } from './routes/entry-types';
import { cronRouter } from './routes/cron';
import { pluginsRouter } from './routes/plugins';
import { notificationsRouter } from './routes/notifications';
import { rpcRouter } from './routes/rpc';
import { Astromech } from '@/transport/local/index';
import { runWithRequest } from '@/request-context/index';
import { getAuth } from '@/users/index';
import { handleMediaRequest } from '@/media/serving/handler';
import type { ResolvedConfig } from '@/types/index';

type AppEnv = { Variables: AuthVariables };

/**
 * Compose the API surface under `${config.basePath}/api`. Hono runs matching
 * handlers in registration order, so the order below is what keeps the public
 * routes reachable without a session.
 */
export function createHttpApp(config: ResolvedConfig): OpenAPIHono<AppEnv> {
    const app = new OpenAPIHono<AppEnv>();
    const api = `${config.basePath}/api`;

    // ========================================================================
    // Error handling
    // ========================================================================

    app.onError(onError);
    app.notFound(onNotFound);

    // ========================================================================
    // Request scope — identity resolves from the request, on first ask
    // ========================================================================

    // `app.fetch` is a public entry point, so the app establishes its own scope
    // rather than requiring an ambient one. Nesting inside the Astro
    // middleware's is free: a request nobody asks about resolves nothing.
    app.use('*', (c, next) => runWithRequest(c.req.raw, () => next()));

    // ========================================================================
    // Security headers — applied to all responses
    // ========================================================================

    const headers = config.security?.headers;

    app.use(
        '*',
        secureHeaders({
            xContentTypeOptions: headers?.xContentTypeOptions ?? 'nosniff',
            xFrameOptions: headers?.xFrameOptions ?? 'DENY',
            referrerPolicy: headers?.referrerPolicy ?? 'strict-origin-when-cross-origin',
        })
    );

    const permissionsPolicy = headers?.permissionsPolicy;
    if (permissionsPolicy) {
        app.use('*', async (c, next) => {
            await next();
            c.res.headers.set('Permissions-Policy', permissionsPolicy);
        });
    }

    // ========================================================================
    // CORS — same-origin only by default; opt-in additional origins via config
    // ========================================================================

    const allowed = config.cors?.origins ?? [];

    app.use(
        '*',
        cors({
            origin: (origin) => {
                if (!origin) return null;
                return allowed.includes(origin) ? origin : null;
            },
            allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization'],
            credentials: true,
        })
    );

    // ========================================================================
    // Public routes (no auth required)
    // ========================================================================

    // Media serving at its own top-level prefix — public and identity-free.
    // Registered above `requireAuth` so no future widening of that middleware
    // can reach it. Hono gives no wildcard param, so the `<id>.<ext>` tail comes
    // off the pathname.
    const mediaPrefix = `${config.mediaRoute}/`;
    app.all(`${config.mediaRoute}/*`, (c) => {
        const url = new URL(c.req.url);
        const path = url.pathname.slice(mediaPrefix.length);
        const dot = path.lastIndexOf('.');
        return handleMediaRequest({
            id: dot >= 0 ? path.slice(0, dot) : path,
            ext: dot >= 0 ? path.slice(dot + 1) : '',
            search: url.searchParams,
            origin: url.origin,
            ifNoneMatch: c.req.header('if-none-match') ?? null,
            range: c.req.header('range') ?? null,
        });
    });

    // Not in a route table: unauthenticated by design, and it deliberately calls
    // `users.query` — a `users:read` method — ungated, because before the first
    // user exists there is no role to hold the grant.
    app.get(`${api}/setup/check`, async (c) => {
        const result = await Astromech.users.query({ limit: 'all' });
        return c.json({ needsSetup: result.data.length === 0 });
    });

    // A catch-all because Better Auth owns its route surface — see
    // `decisions/0056-better-auth-owns-the-users-format-not-its-ddl.md`. Built
    // per request: at construction it would open a dialect in the CLI and MCP.
    app.on(['GET', 'POST'], `${api}/auth/*`, (c) => getAuth().handler(c.req.raw));

    // ========================================================================
    // Plugin RPC + raw routes — enforce access per-method (incl. public), so
    // they mount before the API-wide requireAuth.
    // ========================================================================

    app.route(`${api}/plugins`, pluginsRouter);

    // CRON poke — enforces its own auth (admin session OR bearer secret), so it
    // mounts before the API-wide requireAuth to allow sessionless external pokes.
    app.route(`${api}/cron`, cronRouter);

    // ========================================================================
    // All remaining API routes require authentication
    // ========================================================================

    app.use(`${api}/*`, requireAuth);

    // GET /me — current user + role (used by admin SPA). Not in a route table:
    // no service method behind it, only the session `requireAuth` resolved.
    app.get(`${api}/me`, (c) => {
        return c.json({ data: { user: c.var.user, role: c.var.role } });
    });

    // ========================================================================
    // Route mounting
    // ========================================================================

    app.route(`${api}/entries`, entriesRouter);
    app.route(`${api}/users`, usersRouter);
    app.route(`${api}/media`, mediaRouter);
    app.route(`${api}/settings`, settingsRouter);
    app.route(`${api}/entry-types`, entryTypesRouter);
    app.route(`${api}/notifications`, notificationsRouter);

    // One route over the whole method manifest, beside the REST surface.
    app.route(`${api}/rpc`, rpcRouter);

    // ========================================================================
    // OpenAPI spec + Swagger UI
    // ========================================================================

    app.doc(`${api}/openapi.json`, {
        openapi: '3.0.0',
        info: {
            title: 'Astromech CMS API',
            version: '1.0.0',
            description: 'Astromech CMS REST API',
        },
    });

    if (process.env.NODE_ENV !== 'production') {
        app.get(`${api}/docs`, swaggerUI({ url: `${api}/openapi.json` }));
    }

    return app;
}
