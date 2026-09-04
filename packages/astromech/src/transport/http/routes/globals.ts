/**
 * Global Routes
 *
 * Every global is served here, addressed by the key the globals service itself
 * uses — bare for a host global, qualified for a plugin's. The eleven routes
 * live in `http-routes.shared.ts`; two get a bespoke handler.
 */
import type { HttpRouteSpec } from './http-routes.shared';
import type { ContractCatalogue, RestRoute } from './rest-route';
import type { GlobalCapability } from '@/globals/internal/global';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { GlobalsService, GlobalUpdateData, ResolvedGlobal } from '@/types/index';
import type { Context } from 'hono';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
    GLOBAL_METHOD_ACTIONS,
    GLOBAL_METHOD_REQUIRES,
    globalsContract,
} from '@/globals/contract';
import { StagedGlobalExistsError } from '@/globals/errors';
import { findGlobal } from '@/globals/internal/global';
import { globalsService } from '@/globals/service';
import { globalPermission } from '@/permissions/global-permission';
import { permissionsFor } from '@/permissions/permissions-for';
import { forbidden, fromZodError, notFound } from '@/transport/http/middleware/errors';
import { GLOBALS_ROUTE_SPECS } from './http-routes.shared';
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
    const contracts = { forRequest: contractsForRequest, documented: globalsContract };
    mountRestRoutes(router, contracts, GLOBALS_ROUTES);
    documentBespokeRoutes(router, contracts, DOCUMENTED_SPECS);
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
 * One global's method catalogue, built once per resolved global. The declaration
 * object is the key, so a config reload drops the whole set with it.
 */
const CONTRACTS_BY_GLOBAL = new WeakMap<ResolvedGlobal, ContractCatalogue>();

/**
 * `globalsContract` with each method's `access` resolved to the permission this
 * global checks. The shared catalogue states it as a function of the call's
 * `key`, which the generic mount cannot evaluate — it guards before the body is
 * read, and so before any argument object exists.
 */
function globalContracts(global: ResolvedGlobal): ContractCatalogue {
    const cached = CONTRACTS_BY_GLOBAL.get(global);
    if (cached) return cached;

    const catalogue: ContractCatalogue = Object.fromEntries(
        Object.entries(globalsContract).map(([method, contract]) => [
            method,
            {
                ...contract,
                access: globalPermission(
                    global.id,
                    GLOBAL_METHOD_ACTIONS[method as GlobalMethodName]
                ),
            },
        ])
    );
    CONTRACTS_BY_GLOBAL.set(global, catalogue);
    return catalogue;
}

/** Resolve the catalogue for one request — the global's key is a path param. */
function contractsForRequest(c: Context<Env>): ContractCatalogue | undefined {
    const global = findGlobal(param(c, 'key'));
    return global ? globalContracts(global) : undefined;
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
    const action = GLOBAL_METHOD_ACTIONS[method];
    if (!permissionsFor(c.var.role).allows(globalPermission(key, action))) {
        return forbidden(c);
    }

    const global = findGlobal(key);
    if (!global) return notFound(c, `Global '${key}' not found`);

    const requires = GLOBAL_METHOD_REQUIRES[method];
    if (requires !== undefined && !global.capabilities[requires]) {
        return capabilityDenied(c, key, requires);
    }
    return stagedFlagDenied(c, global);
}

/**
 * The 409 a `?staged=true` request answers when the global does not declare
 * `staging`. `get` and `update` reach the staged row through a flag rather than
 * through a method of their own, so no contract requirement covers them.
 */
function stagedFlagDenied(c: Context<Env>, global: ResolvedGlobal): Response | null {
    if (!flag(c, 'staged') || global.capabilities.staging) return null;
    return capabilityDenied(c, global.id, 'staging');
}

/** The 409 a method gated on a capability the global lacks answers with. */
function capabilityDenied(
    c: Context<Env>,
    key: string,
    capability: GlobalCapability
): Response {
    return c.json(
        {
            error: {
                code: 'capability_not_supported',
                message: `Global "${key}" does not support capability: ${capability}`,
                status: 409,
            },
        },
        409
    );
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

        const global = findGlobal(key);
        // Permission before existence for every read but a public one: a 404 an
        // unpermitted caller can read is a global enumeration. A public global's
        // existence is not a secret, so its plain read skips the gate.
        const isPublicRead = !full && !staged && global?.public === true;
        if (
            !isPublicRead &&
            !permissionsFor(c.var.role).allows(globalPermission(key, 'read'))
        ) {
            return forbidden(c);
        }
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
    // Not in the table: `StagedGlobalExistsError` answers a 409 carrying
    // `details.locale`. Every other throw is re-raised for `onError`.
    router.post('/:key/staged', async (c) => {
        const denied = globalPrecondition(c, 'createStaged');
        if (denied) return denied;

        // The body is optional — an absent one stages a copy of the canonical
        // row, and a `data` key patches over it. Validated here rather than by
        // the generic mount, which this route does not go through.
        const body: Record<string, unknown> = await c.req
            .json<Record<string, unknown>>()
            .catch(() => ({}));
        const args = globalsContract.createStaged.input.safeParse({
            ...contentArgs(c),
            ...(body['data'] !== undefined ? { data: body['data'] } : {}),
        });
        if (!args.success) return fromZodError(c, args.error);

        const { key, locale, data } = args.data;
        try {
            const global = await globalsService.createStaged({
                key,
                ...(locale !== undefined ? { locale } : {}),
                ...(data !== undefined ? { data: data as GlobalUpdateData } : {}),
            });
            return c.json({ data: global }, 201);
        } catch (error) {
            if (!(error instanceof StagedGlobalExistsError)) throw error;
            // The 409 carries the locale, which with the key addresses the
            // staged row the admin redirects to.
            return c.json(
                {
                    error: {
                        code: 'staged_global_exists',
                        message: error.message,
                        status: 409,
                        details: { locale: error.locale },
                    },
                },
                409
            );
        }
    });
}

/** The globals router, mounted at `/globals`. Serves every global. */
export const globalsRouter = createGlobalsRouter();
