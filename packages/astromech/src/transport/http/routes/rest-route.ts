/**
 * The declarative REST route table.
 *
 * A route states `(verb, path, method id, args, envelope)` and `mountRestRoutes`
 * does the rest: read the contract's permission, build the argument object,
 * validate it against the method's own contract schema, dispatch through
 * `scopedServices` so the role is enforced by the handle rather than by a check
 * the handler remembered to write, and wrap the result in the envelope. The only
 * per-route code is `args` — how path params, query string and body become the
 * method's argument object.
 *
 * The permission is read BEFORE the body, so a request that is both unauthorized
 * and malformed answers 403 rather than telling the caller its body was wrong.
 *
 * A handler needing anything else (a permission no contract states, a body that
 * is not JSON, a response outside the closed envelope set) is not in a table: it
 * stays an explicit `router.get(...)` carrying the reason it is not.
 */

import type { OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { PermissionDeniedError } from '@/errors/index';
import { permissionsFor } from '@/permissions/permissions-for';
import { scopedServices } from '@/policies/scoped-services';
import { runWithContext } from '@/request-context/index';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import {
    badRequest,
    forbidden,
    fromZodError,
    notFound,
    requestSchemaError,
} from '@/transport/http/middleware/errors';
import type { ServiceMethodContract } from '@/types/index';

type Env = { Variables: AuthVariables };

/** A domain's contract catalogue, keyed by service method name. */
export type ContractCatalogue = Record<string, ServiceMethodContract>;

/**
 * A catalogue resolved per request, for a domain whose contracts are not
 * constant. Entries is the case: the entry type is a path param, so which
 * contract a route runs under is only known once the request arrives.
 */
export type PerRequestContracts = {
    forRequest: (c: Context<Env>) => ContractCatalogue | undefined;
};

/** What a mount validates against. */
export type RestContracts = ContractCatalogue | PerRequestContracts;

/** Anything callable through a string key — a scoped domain handle. */
type ServiceRecord = Record<string, (args: unknown) => unknown>;

/** The response shapes a table route may answer with. */
export type RestEnvelope = 'data' | 'raw' | 'success' | 'empty';

/** One REST route, fully described. */
export type RestRoute = {
    verb: 'get' | 'post' | 'put' | 'delete';
    /** Path within the router, as Hono matches it. */
    path: string;
    /** Manifest method id — `<domain>.<method>`. */
    id: string;
    /** How this request becomes the method's argument object. */
    args: (c: Context<Env>) => unknown | Promise<unknown>;
    /** Success status; 200 unless given. */
    status?: 201;
    /** `{ data }` unless given. */
    envelope?: RestEnvelope;
    /** When given, a null result answers 404 with this message. */
    notFound?: (c: Context<Env>) => string;
    /**
     * The argument key the request body lands under, when the method takes the
     * body as one key of a larger object (`{ id, data }`). Validation-error
     * field paths are rebased onto it, so the caller reads back the field names
     * it sent rather than the method's argument shape.
     */
    bodyKey?: string;
    /** The query string this route accepts, validated before anything else. */
    query?: z.ZodObject;
    /** Checks run before the body is read; a Response short-circuits the route. */
    precondition?: (c: Context<Env>, route: RestRoute) => Response | null;
    /** Turn a declared domain error into a response; anything else is `onError`'s. */
    mapError?: (error: unknown, c: Context<Env>) => Response | null;
};

/** Mount every route in `routes`, validating against `contracts`. */
export function mountRestRoutes(
    router: OpenAPIHono<Env>,
    contracts: RestContracts,
    routes: RestRoute[]
): void {
    for (const route of routes) {
        router.on(route.verb.toUpperCase(), route.path, (c) =>
            handleRestRoute(c, route, contracts)
        );
    }
}

/** Validate, dispatch and envelope one table route. */
async function handleRestRoute(
    c: Context<Env>,
    route: RestRoute,
    contracts: RestContracts
): Promise<Response> {
    // First, as OpenAPIHono's own request validator was: a query string outside
    // the documented operation never reaches the handler.
    if (route.query !== undefined) {
        const query = route.query.safeParse(c.req.query());
        if (!query.success) return requestSchemaError(c, query.error);
    }

    const denied = route.precondition?.(c, route);
    if (denied) return denied;

    const catalogue = isPerRequest(contracts) ? contracts.forRequest(c) : contracts;
    const contract = catalogue?.[methodName(route.id)];
    if (contract?.input === undefined) {
        throw new Error(
            `Route ${route.verb.toUpperCase()} ${route.path} names '${route.id}', which declares no input schema.`
        );
    }

    // Checked before the body is read, so a caller that may not call this method
    // learns nothing about the request it sent. The scoped handle below is still
    // what enforces; this only decides when the refusal arrives.
    if (!permissionsFor(c.var.role).allowsMethod(contract)) return forbidden(c);

    let args: unknown;
    try {
        args = await route.args(c);
    } catch (error) {
        // An unparseable JSON body is the caller's bug, not the server's.
        if (error instanceof SyntaxError) return badRequest(c, 'Invalid JSON body');
        throw error;
    }

    const parsed = contract.input.safeParse(args);
    if (!parsed.success) return fromZodError(c, parsed.error, route.bodyKey);

    try {
        const result = await invoke(c, route.id, contract, parsed.data);
        if (route.notFound !== undefined && (result === null || result === undefined)) {
            return notFound(c, route.notFound(c));
        }
        return respond(c, route, result);
    } catch (error) {
        // The scoped handle refuses by throwing; every other error is onError's.
        if (error instanceof PermissionDeniedError) return forbidden(c);
        return route.mapError?.(error, c) ?? raise(error);
    }
}

/** Call `<domain>.<method>` on the handle scoped to the caller's role. */
function invoke(
    c: Context<Env>,
    id: string,
    contract: ServiceMethodContract,
    args: unknown
): Promise<unknown> {
    const handle = scopedServices(c.var.role) as unknown as Record<string, ServiceRecord>;
    const fn = handle[domainName(id)]?.[methodName(id)];
    if (typeof fn !== 'function') {
        throw new Error(`Method '${id}' is absent from the scoped services handle.`);
    }

    const call = (): Promise<unknown> => Promise.resolve(fn(args));
    // A session-scoped method takes its subject from the request context rather
    // than from its arguments, so the call runs under the identity the auth
    // middleware attached, whichever layer established the context.
    return contract.sessionScoped === true
        ? runWithContext({ user: c.var.user, role: c.var.role }, call)
        : call();
}

/** Wrap a result in the route's envelope. */
function respond(c: Context<Env>, route: RestRoute, result: unknown): Response {
    const status = (route.status ?? 200) as ContentfulStatusCode;
    switch (route.envelope ?? 'data') {
        case 'data':
            return c.json({ data: result ?? null }, status);
        case 'raw':
            return c.json(result as Record<string, unknown>, status);
        case 'success':
            return c.json({ success: true }, status);
        case 'empty':
            return new Response(null, { status: 204 });
    }
}

// ============================================================================
// Helpers
// ============================================================================

/** Does this mount resolve its catalogue per request? */
function isPerRequest(contracts: RestContracts): contracts is PerRequestContracts {
    return typeof (contracts as PerRequestContracts).forRequest === 'function';
}

/** Re-throw, as an expression — `mapError` declining leaves the error to `onError`. */
function raise(error: unknown): never {
    throw error;
}

/** The domain half of a method id — `settings.set` → `settings`. */
function domainName(id: string): string {
    return id.slice(0, id.indexOf('.'));
}

/** The method half of a method id — `settings.set` → `set`. */
function methodName(id: string): string {
    return id.slice(id.indexOf('.') + 1);
}
