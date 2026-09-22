/**
 * Global Routes
 *
 * Every global is served here, addressed by the key the globals service itself
 * uses — bare for a host global, qualified for a plugin's. The eleven routes
 * live in `http-routes.ts`; two get a bespoke handler.
 */
import type { HttpRouteSpec } from './http-routes';
import type { RestRoute } from './rest-route';
import type { GlobalCapability } from '@/globals/internal/global';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { GlobalsService, GlobalUpdateData, ResolvedGlobal } from '@/types/index';
import type { Context } from 'hono';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { globalsService } from '@/app-context/services';
import { getConfig } from '@/config/registry';
import { CapabilityError } from '@/entries/errors';
import { findGlobal, isGlobalCapability } from '@/globals/internal/global';
import { createStagedGlobalSchema } from '@/globals/schema';
import { globalsDefinition } from '@/globals/service';
import { resolveAccess } from '@/permissions/access';
import { permissionsFor } from '@/permissions/permissions-for';
import {
    errorResponse,
    forbidden,
    fromZodError,
    notFound,
} from '@/transport/http/middleware/errors';
import { GLOBALS_ROUTE_SPECS } from './http-routes';
import { attachHandlers, documentBespokeRoutes, mountRestRoutes } from './rest-route';

type Env = { Variables: AuthVariables };

/** The `GlobalsService` method a route's id names. */
type GlobalMethodName = keyof GlobalsService;

/**
 * Build the globals router. There is exactly ONE in production; this is a
 * factory so tests can mount an isolated instance.
 */
export function createGlobalsRouter(): OpenAPIHono<Env> {
    const router = new OpenAPIHono<Env>();
    mountRestRoutes(router, globalsDefinition.catalogue, GLOBALS_ROUTES);
    documentBespokeRoutes(router, globalsDefinition.catalogue, DOCUMENTED_SPECS);
    mountBespokeRoutes(router);
    return router;
}

/**
 * The query string the single-global read accepts. `full` and `staged` are the
 * two shapes an authenticated read may ask for; `locale` addresses one
 * translation. All three arrive as strings, whatever the contract's own input
 * types them as.
 */
const globalQuery = z.object({
    locale: z.string().optional(),
    full: z.string().optional(),
    staged: z.string().optional(),
});

/**
 * The specs the document is written from. `GET /:key` is bespoke, so its query
 * string has no handler row to declare it — it is attached here instead.
 */
const DOCUMENTED_SPECS: (HttpRouteSpec & { query?: z.ZodObject })[] =
    GLOBALS_ROUTE_SPECS.map((spec) =>
        spec.verb === 'get' && spec.path === '/:key'
            ? { ...spec, query: globalQuery }
            : spec
    );

export const GLOBALS_ROUTES: RestRoute[] = attachHandlers(GLOBALS_ROUTE_SPECS, {
    'put /:key': {
        // `locale` addresses which translation is written; `staged` writes that
        // locale's staged change instead of its canonical row.
        args: async (c) => ({
            ...contentArgs(c),
            ...(flag(c, 'staged') ? { staged: true } : {}),
            data: await c.req.json(),
        }),
        precondition: globalAccess(),
    },
    'post /:key/publish': { args: contentArgs, precondition: globalAccess() },
    'post /:key/unpublish': { args: contentArgs, precondition: globalAccess() },
    'post /:key/schedule': {
        args: async (c) => ({ ...(await c.req.json()), ...contentArgs(c) }),
        precondition: globalAccess(),
    },
    'get /:key/versions': { args: contentArgs, precondition: globalAccess() },
    'post /:key/versions/:versionId/restore': {
        args: (c) => ({ ...contentArgs(c), versionId: param(c, 'versionId') }),
        precondition: globalAccess(),
    },
    'get /:key/staged': { args: contentArgs, precondition: globalAccess() },
    'post /:key/staged/merge': { args: contentArgs, precondition: globalAccess() },
    'delete /:key/staged': { args: contentArgs, precondition: globalAccess() },
});

/**
 * A path param the route has already matched. A bare `Context` cannot say which
 * params a path declares, so the type is widened and narrowed back here.
 */
function param(c: Context<Env>, name: string): string {
    return c.req.param(name) ?? '';
}

/** The `{ key }` every globals method takes. */
function keyArgs(c: Context<Env>): { key: string } {
    return { key: param(c, 'key') };
}

/**
 * {@link keyArgs} plus the locale a content-level route addresses. An absent one
 * leaves the service to fill in the default content locale.
 */
function contentArgs(c: Context<Env>): { key: string; locale?: string } {
    const locale = c.req.query('locale');
    return { ...keyArgs(c), ...(locale ? { locale } : {}) };
}

/** A boolean query flag, in the two spellings the wire has always accepted. */
function flag(c: Context<Env>, name: string): boolean {
    const value = c.req.query(name);
    return value === 'true' || value === '1';
}

/**
 * The three checks a globals route makes before its body is read: the
 * per-(key, action) permission, the global's existence, then the capability the
 * method needs the declaration to carry.
 *
 * The order is what it decides, not the outcome — the scoped handle refuses the
 * call whatever this returns. An undeclared key answers 403 to an
 * under-privileged role and 404 to a privileged one, so a caller cannot
 * enumerate the globals it has no grant for.
 */
function globalAccess(): (c: Context<Env>, route: RestRoute) => Response | null {
    return (c, route) => {
        const method = route.id.slice(route.id.indexOf('.') + 1) as GlobalMethodName;
        return globalPrecondition(c, method);
    };
}

/** {@link globalAccess}, for the bespoke handlers that make the same checks. */
function globalPrecondition(c: Context<Env>, method: GlobalMethodName): Response | null {
    const key = param(c, 'key');
    const declared = globalsDefinition.catalogue[method];
    if (!permissionsFor(c.var.role).allowsAccess(resolveAccess(declared.access, { key })))
        return forbidden(c);

    const global = findGlobal(getConfig(), key);
    if (!global) return notFound(c, `Global '${key}' not found`);

    const requires = capabilityRequired(declared.requires, method);
    if (requires !== undefined && !global.capabilities[requires]) {
        return errorResponse(c, new CapabilityError(key, requires, 'Global'));
    }
    return stagedFlagDenied(c, global);
}

/**
 * A method's `requires` as a global capability. It is typed `string` on the
 * common method shape, so a value no global can declare is a wiring error rather
 * than something to pass over.
 */
function capabilityRequired(
    requires: string | undefined,
    method: GlobalMethodName
): GlobalCapability | undefined {
    if (requires === undefined) return undefined;
    if (!isGlobalCapability(requires)) {
        throw new Error(
            `globals.${method} requires '${requires}', which is not a global capability.`
        );
    }
    return requires;
}

/**
 * The 409 a `?staged=true` request answers when the global does not declare
 * `staging`. `get` and `update` reach the staged row through a flag rather than
 * through a method of their own, so no contract requirement covers them.
 */
function stagedFlagDenied(c: Context<Env>, global: ResolvedGlobal): Response | null {
    if (!flag(c, 'staged') || global.capabilities.staging) return null;
    return errorResponse(c, new CapabilityError(global.id, 'staging', 'Global'));
}

/** The two handlers the table cannot express, each with the reason. */
function mountBespokeRoutes(router: OpenAPIHono<Env>): void {
    // GET /globals/:key
    // Not in the table: the read permission is conditional. A `public` global's
    // plain read is what an unauthenticated visitor makes and needs no grant,
    // while `full` and `staged` always do — a decision the generic mount makes
    // from the contract alone, before it can see the query string.
    router.get('/:key', async (c) => {
        const key = param(c, 'key');
        const full = flag(c, 'full');
        const staged = flag(c, 'staged');

        const global = findGlobal(getConfig(), key);
        // Permission before existence for every read but a public one: a 404 an
        // unpermitted caller can read is a global enumeration. A public global's
        // existence is not a secret, so its plain read skips the gate.
        const access = resolveAccess(globalsDefinition.catalogue.get.access, {
            key,
            full,
            staged,
        });
        if (!permissionsFor(c.var.role).allowsAccess(access)) return forbidden(c);
        if (!global) return notFound(c, `Global '${key}' not found`);
        const refused = stagedFlagDenied(c, global);
        if (refused) return refused;

        const locale = c.req.query('locale');
        // Called directly, not through the scoped handle: the permission above
        // is the conditional one this route exists for, and the handle's own
        // gate cannot express it.
        const result = await globalsService.get({
            key,
            ...(locale ? { locale } : {}),
            ...(full ? { full: true } : {}),
            ...(staged ? { staged: true } : {}),
        });
        if (result === null) return notFound(c, `Global '${key}' not found`);
        return c.json({ data: result });
    });

    // POST /globals/:key/staged
    // Not in the table yet: it calls the service unscoped, behind the
    // precondition. A `StagedGlobalExistsError` is `onError`'s 409.
    router.post('/:key/staged', async (c) => {
        const denied = globalPrecondition(c, 'createStaged');
        if (denied) return denied;

        // The body is optional — an absent one stages a copy of the canonical
        // row, and a `data` key patches over it. Validated here rather than by
        // the generic mount, which this route does not go through.
        const body: Record<string, unknown> = await c.req
            .json<Record<string, unknown>>()
            .catch(() => ({}));
        const args = createStagedGlobalSchema.safeParse({
            ...contentArgs(c),
            ...(body['data'] !== undefined ? { data: body['data'] } : {}),
        });
        if (!args.success) return fromZodError(c, args.error);

        const { key, locale, data } = args.data;
        const global = await globalsService.createStaged({
            key,
            ...(locale !== undefined ? { locale } : {}),
            ...(data !== undefined ? { data: data as GlobalUpdateData } : {}),
        });
        return c.json({ data: global }, 201);
    });
}

/** The globals router, mounted at `/globals`. Serves every global. */
export const globalsRouter = createGlobalsRouter();
