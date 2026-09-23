/**
 * Astromech API — the Hono root app.
 *
 * Built once from the resolved config, so every route registers at the absolute
 * path it is served on and `app.fetch` takes a request unchanged.
 */

import type { AuthVariables } from './middleware/auth';
import type { ResolvedConfig } from '@/types/index';
import { swaggerUI } from '@hono/swagger-ui';
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { usersService } from '@/app-context/services';
import { getAuth } from '@/auth/better-auth';
import { createFirstAdmin, firstAdminSchema, SIGN_UP_CLOSED } from '@/auth/setup';
import { resolveNodeEnv } from '@/env';
import { handleMediaRequest } from '@/media/serving/handler';
import { getRequestScope, runInRequestScope } from '@/request-scope/request-scope';
import { getClientAddress } from '@/transport/http/client-address';
import { requireAuth } from './middleware/auth';
import { forbidden, fromZodError, onError, onNotFound } from './middleware/errors';
import { cronRouter } from './routes/cron';
import { entriesRouter } from './routes/entries';
import { entryTypesRouter } from './routes/entry-types';
import { globalsRouter } from './routes/globals';
import { mediaRouter } from './routes/media';
import { notificationsRouter } from './routes/notifications';
import { createPluginsRouter } from './routes/plugins';
import { rpcRouter } from './routes/rpc';
import { settingsRouter } from './routes/settings';
import { usersRouter } from './routes/users';

type AppEnv = { Variables: AuthVariables };

/**
 * Compose the API surface under `${config.basePath}/api`. Hono runs matching
 * handlers in registration order, so the order below is what keeps the public
 * routes reachable without a session.
 */
export function createHttpApp(config: ResolvedConfig): OpenAPIHono<AppEnv> {
    const app = new OpenAPIHono<AppEnv>();
    const api = `${config.basePath}/api`;

    app.onError(onError);
    app.notFound(onNotFound);

    // `app.fetch` is a public entry point, so the app opens a request scope when
    // none is open for this request, and joins the Astro middleware's when one
    // is, so the session resolves once. The client address goes on the scope so
    // every context built below carries it.
    app.use('*', (c, next) => {
        const open = getRequestScope();
        if (open?.request === c.req.raw) {
            open.clientAddress = getClientAddress(c);
            return next();
        }
        return runInRequestScope(
            { request: c.req.raw, clientAddress: getClientAddress(c) },
            () => next()
        );
    });

    // Security headers, applied to all responses. A media response relaxes
    // `Cross-Origin-Resource-Policy` so another origin can embed a public file,
    // or another subdomain of this site a private one.
    const headers = config.security?.headers;
    const secureHeaderOptions = {
        xContentTypeOptions: headers?.xContentTypeOptions ?? 'nosniff',
        xFrameOptions: headers?.xFrameOptions ?? 'DENY',
        referrerPolicy: headers?.referrerPolicy ?? 'strict-origin-when-cross-origin',
    };
    const apiSecureHeaders = secureHeaders(secureHeaderOptions);
    const mediaSecureHeaders = secureHeaders({
        ...secureHeaderOptions,
        crossOriginResourcePolicy:
            config.media.access === 'public' ? 'cross-origin' : 'same-site',
    });

    // The same paths Hono's `${mediaRoute}/*` matches, the bare route included.
    const mediaPrefix = `${config.mediaRoute}/`;
    const isMediaPath = (path: string): boolean =>
        path === config.mediaRoute || path.startsWith(mediaPrefix);

    app.use('*', (c, next) =>
        isMediaPath(c.req.path) ? mediaSecureHeaders(c, next) : apiSecureHeaders(c, next)
    );

    const permissionsPolicy = headers?.permissionsPolicy;
    if (permissionsPolicy) {
        app.use('*', async (c, next) => {
            await next();
            c.res.headers.set('Permissions-Policy', permissionsPolicy);
        });
    }

    // CORS: same-origin only by default; opt in additional origins via config.
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

    // Public routes — no auth required.

    // Media serving at its own top-level prefix — public and identity-free.
    // Registered above `requireAuth` so no future widening of that middleware
    // can reach it. Hono gives no wildcard param, so the `<id>.<ext>` tail comes
    // off the pathname. Hono answers HEAD from the GET handler with the body
    // dropped; every other method is a 405.
    app.get(`${config.mediaRoute}/*`, (c) => {
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
    app.all(`${config.mediaRoute}/*`, (c) =>
        c.text('Method not allowed', 405, { Allow: 'GET, HEAD' })
    );

    // Not in a route table: unauthenticated by design, and it deliberately calls
    // `users.query` — a `users:read` method — ungated, because before the first
    // user exists there is no role to hold the grant.
    app.get(`${api}/setup/check`, async (c) => {
        const result = await usersService.query({ limit: 'all' });
        return c.json({ needsSetup: result.data.length === 0 });
    });

    // Not in a route table either, and unauthenticated for the same reason:
    // before the first user there is no role to hold a grant. The write refuses
    // itself once a user exists, so nothing else guards this.
    app.post(`${api}/setup`, async (c) => {
        const body = await c.req.json().catch(() => null);
        const parsed = firstAdminSchema.safeParse(body);
        if (!parsed.success) return fromZodError(c, parsed.error);

        const result = await createFirstAdmin(parsed.data);
        // Better Auth's refusal code, in the API's own envelope. It creates no
        // session: the admin signs in straight after.
        if (result === 'closed') {
            return forbidden(c, SIGN_UP_CLOSED.message, SIGN_UP_CLOSED.code);
        }
        return c.json({ success: true });
    });

    // A catch-all because Better Auth owns its route surface, so core does not
    // list its routes. Built per request: at construction it would open a
    // dialect in the CLI and MCP.
    app.on(['GET', 'POST'], `${api}/auth/*`, (c) => getAuth().handler(c.req.raw));

    // Plugin RPC + raw routes enforce access per-method (incl. public), so
    // they mount before the API-wide requireAuth.
    app.route(`${api}/plugins`, createPluginsRouter());

    // CRON poke — enforces its own auth (admin session OR bearer secret), so it
    // mounts before the API-wide requireAuth to allow sessionless external pokes.
    app.route(`${api}/cron`, cronRouter);

    // All remaining API routes require authentication.
    app.use(`${api}/*`, requireAuth);

    // GET /me — current user + role (used by admin SPA). Not in a route table:
    // no service method behind it, only the session `requireAuth` resolved.
    app.get(`${api}/me`, (c) => {
        return c.json({ data: { user: c.var.ctx.user, role: c.var.ctx.role } });
    });

    app.route(`${api}/entries`, entriesRouter);
    // Authenticated, as entries are: a site reads a `public` global through the
    // local API, not over HTTP.
    app.route(`${api}/globals`, globalsRouter);
    app.route(`${api}/users`, usersRouter);
    app.route(`${api}/media`, mediaRouter);
    app.route(`${api}/settings`, settingsRouter);
    app.route(`${api}/entry-types`, entryTypesRouter);
    app.route(`${api}/notifications`, notificationsRouter);

    // One route over the whole method manifest, beside the REST surface.
    app.route(`${api}/rpc`, rpcRouter);

    app.doc(`${api}/openapi.json`, {
        openapi: '3.0.0',
        info: {
            title: 'Astromech CMS API',
            version: '1.0.0',
            description: 'Astromech CMS REST API',
        },
    });

    if (resolveNodeEnv() === 'development') {
        app.get(`${api}/docs`, swaggerUI({ url: `${api}/openapi.json` }));
    }

    return app;
}
