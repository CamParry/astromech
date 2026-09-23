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
import { badRequest, fromZodError, notFound } from '@/transport/http/middleware/errors';
import { fromQueryParams } from './query-string';
import { routeAccess } from './route-access';

/**
 * The server half of the REST route table.
 *
 * The rows are data, in `http-routes.ts`. `mountRestRoutes` serves each one
 * from the row alone: it builds the method's argument object from the path, the
 * query string and the body, checks access, calls the scoped handle and wraps
 * the result in the row's envelope. The method's own input parse validates.
 */

type Env = { Variables: AuthVariables };

/** A domain's contract catalogue, keyed by service method name. */
export type ContractCatalogue = Record<string, ServiceMethodContract>;

/** What a router hands `mountRestRoutes`. */
export type RestMount = {
    /** The catalogue the service binds: each method's access and input schema. */
    catalogue: ContractCatalogue;
    /**
     * The catalogue the OpenAPI document is written from, when it differs. The
     * entries router documents `{type}` rather than any one type.
     */
    documented?: ContractCatalogue;
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
    const documented = mount.documented ?? mount.catalogue;
    for (const route of mount.specs) {
        documentRoute(router, documented, route);
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
    // `dir` is the one query param no method reads, so the wire checks it.
    const dir = c.req.query('dir');
    if (dir !== undefined && dir !== 'asc' && dir !== 'desc') {
        return badRequest(c, '`dir` must be `asc` or `desc`');
    }
    const urlArgs = { ...queryArgs(c, route, contract.input), ...c.req.param() };

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
 * The arguments the query string carries: every param on a `GET` or `DELETE`,
 * the row's `queryArgs` on a `POST` or `PUT`. A value the method's input declares
 * a boolean or a number is converted; anything it cannot read is passed on
 * as sent, for the method's parse to refuse.
 */
function queryArgs(
    c: Context<Env>,
    route: HttpRouteSpec,
    input: z.ZodType
): Record<string, unknown> {
    const shape = input instanceof z.ZodObject ? input.shape : {};
    const readsAll = route.verb === 'get' || route.verb === 'delete';
    const names = new Set(route.queryArgs ?? []);
    const query = Object.fromEntries(
        Object.entries(c.req.query()).filter(([name]) => readsAll || names.has(name))
    );

    const args = fromQueryParams(query);
    for (const [name, value] of Object.entries(args)) {
        if (typeof value === 'string') args[name] = fromQueryString(value, shape[name]);
    }
    return args;
}

/** A query-string value as the input field `schema` types it. */
function fromQueryString(value: string, schema: z.ZodType | undefined): unknown {
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
 * Whether `schema`, under any optional, default or catch wrapper, is a `kind`
 * or a union with one among its options.
 */
function accepts(
    schema: z.ZodType | undefined,
    kind: typeof z.ZodBoolean | typeof z.ZodNumber
): boolean {
    let inner: unknown = schema;
    while (
        inner instanceof z.ZodOptional ||
        inner instanceof z.ZodNullable ||
        inner instanceof z.ZodDefault ||
        inner instanceof z.ZodCatch
    ) {
        inner = inner.unwrap();
    }
    if (inner instanceof z.ZodUnion) {
        return (inner.options as z.ZodType[]).some((option) => accepts(option, kind));
    }
    return inner instanceof kind;
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

/** Call `<domain>.<method>` on the handle scoped to the caller's role. */
function invoke(c: Context<Env>, id: string, args: unknown): Promise<unknown> {
    const handle = createServices(c.var.ctx, { overrideAccess: false });
    const service = contentService(handle, domainName(id));
    const fn = service[methodName(id)];
    if (typeof fn !== 'function') {
        throw new Error(`Method '${id}' is absent from the scoped services handle.`);
    }

    // Called on the service, as `callMethod` does. A session-scoped method takes
    // its subject from the request scope rather than from its arguments; the
    // scope is already established here.
    return Promise.resolve((fn as (args: unknown) => unknown).call(service, args));
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
    const name = paramNames(route.path).at(-1);
    return name === undefined ? '' : (c.req.param(name) ?? '');
}

/**
 * Register one row in the router's OpenAPI document, if a contract describes it.
 * A row whose method has no contract in this catalogue is silently absent. Only
 * a bespoke row can be, since `mountRestRoutes` refuses a generic one at boot.
 */
function documentRoute(
    router: OpenAPIHono<Env>,
    contracts: ContractCatalogue,
    route: HttpRouteSpec
): void {
    const contract = contracts[methodName(route.id)];
    if (contract === undefined) return;

    const params = pathParams(route.path);
    const body = requestBody(route, contract);
    const query = documentedQuery(route, contract);
    const status = route.status ?? (route.envelope === 'empty' ? 204 : 200);

    router.openAPIRegistry.registerPath({
        method: route.verb,
        path: documentPath(route.path),
        ...(contract.summary !== undefined ? { summary: contract.summary } : {}),
        request: {
            ...(params !== undefined ? { params } : {}),
            ...(query !== undefined ? { query } : {}),
            ...(body !== undefined
                ? { body: { content: { 'application/json': { schema: body } } } }
                : {}),
        },
        responses: { [status]: { description: contract.summary ?? 'Success' } },
    });
}

/**
 * The query string this route documents, under the schemas the method's input
 * gives each argument: on a `GET` or `DELETE`, every argument the path does not
 * carry; on a `POST` or `PUT`, the row's `queryArgs`. `sort` is documented as
 * the `sort` and `dir` pair it travels as.
 */
function documentedQuery(
    route: HttpRouteSpec,
    contract: ServiceMethodContract
): z.ZodObject | undefined {
    const input = contract.input;
    const shape = input instanceof z.ZodObject ? input.shape : {};
    const onPath = new Set(paramNames(route.path));
    const names =
        route.verb === 'get' || route.verb === 'delete'
            ? Object.keys(shape).filter((name) => !onPath.has(name))
            : [...(route.queryArgs ?? [])];
    if (names.length === 0) return undefined;

    return z.object(
        Object.fromEntries(names.flatMap((name) => queryParams(name, shape[name])))
    );
}

/**
 * The query params one argument travels as, each with its schema: `sort` as
 * `sort` and `dir`, an object `where` as one `where[field]` per field, and any
 * other object (a free-form `where`) not at all.
 */
function queryParams(name: string, schema: z.ZodType | undefined): [string, z.ZodType][] {
    if (name === 'sort') {
        return [
            ['sort', z.string().optional()],
            ['dir', z.enum(['asc', 'desc']).optional()],
        ];
    }
    const inner = schema instanceof z.ZodOptional ? schema.unwrap() : schema;
    if (inner instanceof z.ZodObject) {
        if (name !== 'where') return [];
        return Object.entries(inner.shape).map(([field, fieldSchema]) => [
            `where[${field}]`,
            fieldSchema,
        ]);
    }
    if (inner instanceof z.ZodRecord) return [];
    return [[name, schema ?? z.string().optional()]];
}

/** `/:type/:id` → `/{type}/{id}`, the form an OpenAPI path takes. */
function documentPath(path: string): string {
    return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/** The names Hono matches as path params, in order. */
function paramNames(path: string): string[] {
    return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map(([, name]) => name ?? '');
}

/** The path params of `path` as a schema, or undefined when it has none. */
function pathParams(path: string): z.ZodObject | undefined {
    const names = paramNames(path);
    if (names.length === 0) return undefined;
    return z.object(Object.fromEntries(names.map((name) => [name, z.string()])));
}

/**
 * The request body this route documents: the key it declares as `bodyKey`, or
 * the method's argument object minus whatever the URL already carries (path
 * params and `queryArgs`). A route left with no fields sends no body.
 */
function requestBody(
    route: HttpRouteSpec,
    contract: ServiceMethodContract
): z.ZodType | undefined {
    if (route.verb !== 'post' && route.verb !== 'put') return undefined;
    const input = contract.input;
    if (!(input instanceof z.ZodObject)) return undefined;

    if (route.bodyKey !== undefined) return input.shape[route.bodyKey];

    // Rebuilt from the shape: a schema with a refinement (`oneOrMany`) cannot
    // be narrowed with `omit`.
    const onUrl = new Set([...paramNames(route.path), ...(route.queryArgs ?? [])]);
    // A method taking `id` or `ids` is addressed one way per route: by the
    // path's `:id`, or by the body's `ids` on a bulk row.
    if (onUrl.has('id')) onUrl.add('ids');
    if (route.client === 'list') onUrl.add('id');
    const rest = Object.entries(input.shape).filter(([name]) => !onUrl.has(name));
    if (rest.length === 0) return undefined;
    return z.object(Object.fromEntries(rest));
}

/**
 * Is this the method's own input parse failing? A field-pipeline failure is a
 * `ValidationError` too, but carries `fields`, and its names are already the
 * caller's — so it goes to `onError` untouched.
 */
export function isMethodInputError(error: unknown): error is ValidationError {
    return error instanceof ValidationError && error.fields === undefined;
}

/** The domain half of a method id — `users.update` → `users`. */
function domainName(id: string): string {
    return id.slice(0, id.indexOf('.'));
}

/** The method half of a method id — `users.update` → `update`. */
function methodName(id: string): string {
    return id.slice(id.indexOf('.') + 1);
}
