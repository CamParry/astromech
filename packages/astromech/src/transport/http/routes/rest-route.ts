import type { HttpRouteSpec } from './http-routes';
import type { MissingTarget } from './route-access';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { ServiceMethodContract } from '@/types/index';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from '@hono/zod-openapi';
import { createServices } from '@/app-context/services';
import { ValidationError } from '@/errors/validation';
import { contentService } from '@/policies/call-method';
import { callServiceMethod } from '@/services/call-service-method';
import { badRequest, fromZodError, notFound } from '@/transport/http/middleware/errors';
import { domainName, methodName, pathParamNames } from './http-routes';
import { accepts, inputShape } from './method-input';
import { fromQueryParams } from './query-string';
import { documentRoute } from './rest-route-document';
import { routeAccess } from './route-access';

/**
 * The server half of the REST route table.
 *
 * The rows are data, in `http-routes.ts`. `mountRestRoutes` serves each one
 * from the row alone: it builds the method's argument object from the path, the
 * query string and the body, checks access, calls the scoped handle and wraps
 * the result in the row's envelope. The method's own input parse validates.
 * What each row adds to the OpenAPI document is `rest-route-document.ts`.
 */

type Env = { Variables: AuthVariables };

/** A domain's contract catalogue, keyed by service method name. */
export type ContractCatalogue = Record<string, ServiceMethodContract>;

/** What a router hands `mountRestRoutes`. */
export type RestMount = {
    /** The catalogue the service binds: each method's access and input schema. */
    catalogue: ContractCatalogue;
    /**
     * The catalogue the OpenAPI document writes a route from, when it differs:
     * the entries router documents `{type}` wherever the path carries it.
     */
    documented?: (route: HttpRouteSpec) => ContractCatalogue;
    /** The domain's rows. A bespoke row is documented here and served by hand. */
    specs: readonly HttpRouteSpec[];
    /** The 404 a route answers, after the permission, when its target is absent. */
    missingTarget?: MissingTarget;
};

/**
 * Document every row in `specs` and serve every row that is not bespoke. A row
 * naming a method the catalogue does not describe is a wiring mistake, so it
 * fails here, at boot, rather than on the first request.
 */
export function mountRestRoutes(router: OpenAPIHono<Env>, mount: RestMount): void {
    for (const route of mount.specs) {
        documentRoute(router, mount.documented?.(route) ?? mount.catalogue, route);
        if (route.handler === 'bespoke') continue;

        const contract = mount.catalogue[methodName(route.id)];
        if (contract === undefined) {
            throw new Error(
                `Route ${route.verb.toUpperCase()} ${route.path} names '${route.id}', which this catalogue does not describe.`
            );
        }
        router.on(route.verb.toUpperCase(), route.path, (c) =>
            handleRestRoute(c, route, contract, mount.missingTarget)
        );
    }
}

/** Build the arguments, check access, dispatch and envelope one table route. */
async function handleRestRoute(
    c: Context<Env>,
    route: HttpRouteSpec,
    contract: ServiceMethodContract,
    missingTarget: MissingTarget | undefined
): Promise<Response> {
    const shape = inputShape(contract.input);
    // `dir` is the one query param no method reads, so the wire checks it.
    const dir = c.req.query('dir');
    if ('sort' in shape && dir !== undefined && dir !== 'asc' && dir !== 'desc') {
        return badRequest(c, '`dir` must be `asc` or `desc`');
    }
    const urlArgs = {
        ...queryArgs(c, route, shape),
        ...pathArgs(c, shape),
    };

    // Checked before the body is read, so a caller that may not call this method
    // learns nothing about the request it sent.
    const denied = routeAccess(c, contract.access, urlArgs, missingTarget);
    if (denied) return denied;

    const body = await readBody(c, route);
    if (body instanceof Response) return body;

    // The URL wins over the body: a body cannot re-address the call.
    const args = { ...body, ...urlArgs };

    try {
        const result = await invoke(c, route.id, args);
        if (route.notFound !== undefined && (result === null || result === undefined)) {
            return notFound(c, `${route.notFound} '${lastParam(c, route)}' not found`);
        }
        return respond(c, route, result);
    } catch (error) {
        // The method parses its own input, so its 422 arrives here, rendered
        // under the names the caller sent. Every other error, the scoped
        // handle's refusal included, is onError's.
        if (isMethodInputError(error)) return fromZodError(c, error, route.bodyKey);
        throw error;
    }
}

/**
 * The arguments the query string carries: on a `GET` or `DELETE`, each param
 * the method's input declares, and none it does not (a cache buster, a tracking
 * param); on a `POST` or `PUT`, the row's `queryArgs`. A value the input
 * declares a boolean or a number is converted; anything it cannot read is
 * passed on as sent, for the method's parse to refuse.
 */
function queryArgs(
    c: Context<Env>,
    route: HttpRouteSpec,
    shape: Record<string, z.ZodType>
): Record<string, unknown> {
    const readsAll = route.verb === 'get' || route.verb === 'delete';
    const names = new Set(route.queryArgs ?? []);
    const query = Object.fromEntries(
        Object.entries(c.req.query()).filter(([name]) =>
            readsAll ? declaresQueryParam(shape, name) : names.has(name)
        )
    );

    const args = fromQueryParams(query);
    for (const [name, value] of Object.entries(args)) {
        if (typeof value === 'string') args[name] = fromUrlValue(value, shape[name]);
    }
    return args;
}

/**
 * Whether the input declares the argument query param `name` travels as:
 * `where[field]` as `where`, `dir` as `sort`, and any other param as itself.
 */
function declaresQueryParam(shape: Record<string, z.ZodType>, name: string): boolean {
    if (/^where\[[^\]]+\]$/.test(name)) return 'where' in shape;
    if (name === 'dir') return 'sort' in shape;
    return name in shape;
}

/**
 * The arguments the path carries, converted as the query string's are: a
 * version is addressed by its number (`/versions/3`), which arrives as a string.
 */
function pathArgs(
    c: Context<Env>,
    shape: Record<string, z.ZodType>
): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(c.req.param()).map(([name, value]) => [
            name,
            fromUrlValue(value, shape[name]),
        ])
    );
}

/** A query-string or path value as the input field `schema` types it. */
function fromUrlValue(value: string, schema: z.ZodType | undefined): unknown {
    if (accepts(schema, z.ZodBoolean)) {
        if (value === 'true' || value === '1') return true;
        if (value === 'false' || value === '0') return false;
    }
    if (accepts(schema, z.ZodNumber) && value.trim() !== '' && !Number.isNaN(+value)) {
        return Number(value);
    }
    return value;
}

/**
 * The body's contribution to the arguments: none for a `GET` or `DELETE` or an
 * empty body, the body under the row's `bodyKey`, or the body object itself. A
 * body that is not JSON, or not an object where the arguments need one, is 400.
 */
async function readBody(
    c: Context<Env>,
    route: HttpRouteSpec
): Promise<Record<string, unknown> | Response> {
    if (route.verb === 'get' || route.verb === 'delete') return {};
    const text = await c.req.text();
    if (text.trim() === '') return {};

    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        return badRequest(c, 'Invalid JSON body');
    }
    if (route.bodyKey !== undefined) return { [route.bodyKey]: body };
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return badRequest(c, 'The request body must be a JSON object');
    }
    return body as Record<string, unknown>;
}

/**
 * Call `<domain>.<method>` on the handle scoped to the caller's role. A
 * session-scoped method takes its subject from the request scope rather than
 * from its arguments; the scope is already established here.
 */
function invoke(c: Context<Env>, id: string, args: unknown): Promise<unknown> {
    const handle = createServices(c.var.ctx, { overrideAccess: false });
    return callServiceMethod(
        contentService(handle, domainName(id)),
        methodName(id),
        args,
        `Method '${id}' is absent from the scoped services handle.`
    );
}

/** Wrap a result in the route's envelope. */
function respond(c: Context<Env>, route: HttpRouteSpec, result: unknown): Response {
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

/** The value of the route's last path param: the id or key a 404 names. */
function lastParam(c: Context<Env>, route: HttpRouteSpec): string {
    const name = pathParamNames(route.path).at(-1);
    return name === undefined ? '' : (c.req.param(name) ?? '');
}

/**
 * Is this the method's own input parse failing? A field-pipeline failure is a
 * `ValidationError` too, but carries `fields`, and its names are already the
 * caller's — so it goes to `onError` untouched.
 */
export function isMethodInputError(error: unknown): error is ValidationError {
    return error instanceof ValidationError && error.fields === undefined;
}
