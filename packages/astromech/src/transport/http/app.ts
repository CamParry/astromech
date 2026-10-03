/**
 * Astromech API — the Hono root app.
 *
 * Built once from the resolved config, so every route registers at the absolute
 * path it is served on and `app.fetch` takes a request unchanged.
 */

import type { AuthVariables } from './middleware/auth';
import type { ServerBindings } from '@/transport/http/client-address';
import type { ResolvedConfig } from '@/types/index';
import { swaggerUI } from '@hono/swagger-ui';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { handleAuthRequest } from '@/auth/better-auth';
import { meSchema } from '@/auth/schema';
import {
    createFirstAdmin,
    firstAdminSchema,
    needsSetup,
    SIGN_UP_CLOSED,
} from '@/auth/setup';
import { resolveNodeEnv } from '@/env';
import { handleMediaRequest } from '@/media/serving/handler';
import { getRequestScope, runInRequestScope } from '@/request-scope/request-scope';
import { parseOutput } from '@/services/parse-method-output';
import { getClientAddress } from '@/transport/http/client-address';
import { requireAuth } from './middleware/auth';
import { forbidden, fromZodError, onError, onNotFound } from './middleware/errors';
import { cronRouter } from './routes/cron';
import { entriesRouter } from './routes/entries';
import { entryTypesRouter } from './routes/entry-types';
import { errorResponses } from './routes/error-responses';
import { globalsRouter } from './routes/globals';
import { mediaRouter } from './routes/media';
import { notificationsRouter } from './routes/notifications';
import { openApiDocument } from './routes/openapi-document';
import { createPluginsRouter } from './routes/plugins';
import { rpcRouter } from './routes/rpc';
import { usersRouter } from './routes/users';

type AppEnv = { Bindings: ServerBindings; Variables: AuthVariables };

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

    // Not in a route table: unauthenticated by design. Before the first user
    // exists there is no role to hold a grant.
    app.get(`${api}/setup/check`, async (c) =>
        c.json({ needsSetup: await needsSetup() })
    );

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
    app.on(['GET', 'POST'], `${api}/auth/*`, (c) =>
        handleAuthRequest(c.req.raw, getClientAddress(c))
    );

    // Plugin RPC + raw routes enforce access per-method (incl. public), so
    // they mount before the API-wide requireAuth. So does the one route over
    // the whole method manifest, which answers a plugin method as they do and
    // requires a session for everything else itself.
    app.route(`${api}/plugins`, createPluginsRouter());
    app.route(`${api}/rpc`, rpcRouter);

    // CRON poke — enforces its own auth (admin session OR bearer secret), so it
    // mounts before the API-wide requireAuth to allow sessionless external pokes.
    app.route(`${api}/cron`, cronRouter);

    // All remaining API routes require authentication.
    app.use(`${api}/*`, requireAuth);

    // GET /me — current user + role (used by admin SPA). Not in a route table:
    // no service method behind it, only the session `requireAuth` resolved.
    // Parsed as a method's result is, so it answers the public shape.
    app.get(`${api}/me`, (c) => {
        const { user, role } = c.var.ctx;
        return c.json({
            data: parseOutput(meSchema, { user, role }, 'The /me response'),
        });
    });
    app.openAPIRegistry.registerPath({
        method: 'get',
        path: `${api}/me`,
        // No method answers `/me`, so its id follows the path.
        operationId: 'me.get',
        summary: 'Read the signed-in user and their role.',
        responses: {
            200: {
                description: 'The signed-in user and their role.',
                content: {
                    'application/json': { schema: z.object({ data: meSchema }) },
                },
            },
            ...errorResponses({ session: true, permission: false, input: false }),
        },
    });

    app.route(`${api}/entries`, entriesRouter);
    // Authenticated, as entries are: a site reads a `public` global through the
    // local API, not over HTTP.
    app.route(`${api}/globals`, globalsRouter);
    app.route(`${api}/users`, usersRouter);
    app.route(`${api}/media`, mediaRouter);
    app.route(`${api}/entry-types`, entryTypesRouter);
    app.route(`${api}/notifications`, notificationsRouter);

    // Not `app.doc`: the document adds the plugin methods, and `app.doc` answers
    // a failure as `{}` with no log where this one reaches `onError`.
    app.get(`${api}/openapi.json`, (c) => c.json(openApiDocument(app, api)));

    if (resolveNodeEnv() === 'development') {
        app.get(`${api}/docs`, swaggerUI({ url: `${api}/openapi.json` }));
    }

    return app;
}
