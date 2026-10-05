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
import { accessRefusals, declaresArguments, errorResponses } from './error-responses';
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

/** The method input's keys, or none when the input is not an object. */
function inputShape(input: z.ZodType | undefined): Record<string, z.ZodType> {
    return input instanceof z.ZodObject ? input.shape : {};
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

    const params = pathParams(route.path, contract.input);
    const body = requestBody(route, contract);
    const query = documentedQuery(route, contract);
    const status = route.status ?? (route.envelope === 'empty' ? 204 : 200);
    const description = contract.summary ?? 'Success';
    const response = responseBody(route, contract.output);

    router.openAPIRegistry.registerPath({
        method: route.verb,
        path: documentPath(route.path),
        operationId: operationId(route),
        ...(contract.summary !== undefined ? { summary: contract.summary } : {}),
        request: {
            ...(params !== undefined ? { params } : {}),
            ...(query !== undefined ? { query } : {}),
            ...(body !== undefined
                ? { body: { content: { 'application/json': { schema: body } } } }
                : {}),
        },
        responses: {
            [status]: {
                description,
                ...(response !== undefined
                    ? { content: { 'application/json': { schema: response } } }
                    : {}),
            },
            ...errorResponses({
                badRequest: badRequestReasons(route, inputShape(contract.input)),
                // Every table router mounts behind `requireAuth` (`transport/http/app.ts`),
                // so a route answers 401 without a session even when its method is public.
                session: true,
                permission: accessRefusals(contract.access).permission,
                ...notFoundRefusal(route, contract),
                conflict: conflictReasons(route, contract),
                input: declaresArguments(contract.input),
            }),
        },
    });
}

/**
 * The route's operation id: its method id (`entries.update`), the manifest's
 * name for the method. A method with more than one route names the others apart:
 * a list row adds `Many` (`entries.updateMany`), a row the client never uses its verb.
 */
function operationId(route: HttpRouteSpec): string {
    if (route.client === 'list') return `${route.id}Many`;
    if (route.client === 'none') {
        return `${route.id}${route.verb.charAt(0).toUpperCase()}${route.verb.slice(1)}`;
    }
    return route.id;
}

/**
 * Why this route can answer 400: a body that is not JSON (see `readBody`), a
 * `dir` that is neither order, a list's `sort` or `where` naming a key it cannot
 * use (`UnknownSortKeyError`, `UnknownWhereKeyError`, `InvalidReferencesFilterError`),
 * and a public read of trashed rows (`PublicTrashedReadError`).
 */
function badRequestReasons(
    route: HttpRouteSpec,
    shape: Record<string, z.ZodType>
): string[] {
    const reasons: string[] = [];
    if (route.verb === 'post' || route.verb === 'put') {
        reasons.push(
            route.bodyKey === undefined
                ? 'the body is not a JSON object'
                : 'the body is not valid JSON'
        );
    }
    if ('sort' in shape) {
        reasons.push(
            '`dir` is not `asc` or `desc`, or `sort` names a key the list cannot sort by'
        );
    }
    if ('where' in shape) reasons.push('`where` names a key the list cannot filter by');
    if ('trashed' in shape && 'full' in shape) {
        reasons.push('`trashed` is asked for without `full`');
    }
    return reasons;
}

/**
 * The 404 a route documents: one when the request names an entry type, a global,
 * a row or a version, in the path or as a list row's list. An idempotent `DELETE`
 * answers a missing row as done, so its id alone documents none.
 */
function notFoundRefusal(
    route: HttpRouteSpec,
    contract: ServiceMethodContract
): { notFound?: string } {
    const answersMissingRow = !(route.verb === 'delete' && contract.idempotent === true);
    const addressed = [
        ...paramNames(route.path),
        ...(route.client === 'list' ? [route.listArg ?? 'ids'] : []),
    ];
    const nouns = addressed.flatMap((name): string[] => {
        switch (name) {
            case 'type':
                return ['entry type'];
            case 'key':
                return ['global'];
            case 'version':
                return ['version'];
            case 'id':
            case 'ids':
                return answersMissingRow
                    ? [ROW_NOUNS[domainName(route.id)] ?? 'row']
                    : [];
            default:
                return [name];
        }
    });
    if (nouns.length === 0) return {};
    const last = nouns.pop();
    const list = nouns.length === 0 ? last : `${nouns.join(', ')} or ${last}`;
    return { notFound: `No ${list} matches the request.` };
}

/** What one row of each domain is called in a 404's description. */
const ROW_NOUNS: Record<string, string> = {
    entries: 'entry',
    users: 'user',
    media: 'media item',
    notifications: 'notification',
    security: 'address',
};

/**
 * Why this route can answer 409: the method `requires` a capability its entry
 * type or global may not declare (`CapabilityError`), and the row's own reason.
 */
function conflictReasons(
    route: HttpRouteSpec,
    contract: ServiceMethodContract
): string[] {
    const reasons: string[] = [];
    const { requires } = contract;
    if (requires !== undefined) {
        const target = domainName(route.id) === 'globals' ? 'global' : 'entry type';
        reasons.push(
            `the ${target} does not declare \`${requires}\` (\`capability_not_supported\`)`
        );
    }
    if (route.refusals?.conflict !== undefined) reasons.push(route.refusals.conflict);
    return reasons;
}

/**
 * The body a route answers with: the method's `output` in the row's envelope
 * (see `respond`). None for a bodiless 204, or a method that declares no output.
 */
function responseBody(
    route: HttpRouteSpec,
    output: z.ZodType | undefined
): z.ZodType | undefined {
    switch (route.envelope ?? 'data') {
        case 'data':
            return output === undefined
                ? undefined
                : z.object({ data: dataSchema(output, route.notFound !== undefined) });
        case 'raw':
            return output;
        case 'success':
            return z.object({ success: z.literal(true) });
        case 'empty':
            return undefined;
    }
}

/**
 * The `data` of a `{ data }` body. A route that answers null with a 404 never
 * sends null.
 */
function dataSchema(output: z.ZodType, notFound: boolean): z.ZodType {
    if (notFound && output instanceof z.ZodNullable) return output.unwrap() as z.ZodType;
    return nullableAsUnion(output);
}

/**
 * `output` with null as a union option rather than `.nullable()`, which on a
 * named schema would make the generator write null into the shared component.
 */
export function nullableAsUnion(output: z.ZodType): z.ZodType {
    if (!(output instanceof z.ZodNullable)) return output;
    return z.union([output.unwrap() as z.ZodType, z.null()]);
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
    const shape = inputShape(input);
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

/**
 * The path params of `path` as a schema, or undefined when it has none. A param
 * the method's input declares a number is documented as that number; every
 * other param is a string.
 */
function pathParams(path: string, input: z.ZodType): z.ZodObject | undefined {
    const names = paramNames(path);
    if (names.length === 0) return undefined;
    const shape = inputShape(input);
    return z.object(
        Object.fromEntries(
            names.map((name) => {
                const schema = shape[name];
                return [
                    name,
                    schema !== undefined && accepts(schema, z.ZodNumber)
                        ? schema
                        : z.string(),
                ];
            })
        )
    );
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
    // Strict, as the input is: the body refuses a key it does not declare.
    return z.strictObject(Object.fromEntries(rest));
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
