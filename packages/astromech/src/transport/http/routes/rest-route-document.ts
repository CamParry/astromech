import type { HttpRouteSpec } from './http-routes';
import type { ContractCatalogue } from './rest-route';
import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { ServiceMethodContract } from '@/types/index';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { accessRefusals, declaresArguments, errorResponses } from './error-responses';
import { domainName, fillPathParams, methodName, pathParamNames } from './http-routes';
import { accepts, inputShape } from './method-input';

/**
 * The documentation half of the REST route table: what each row adds to the
 * router's OpenAPI document. `mountRestRoutes` (`rest-route.ts`) calls
 * `documentRoute` for every row, bespoke ones included.
 */

type Env = { Variables: AuthVariables };

/**
 * Register one row in the router's OpenAPI document, if a contract describes it.
 * A row whose method has no contract in this catalogue is silently absent. Only
 * a bespoke row can be, since `mountRestRoutes` refuses a generic one at boot.
 */
export function documentRoute(
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
        ...pathParamNames(route.path),
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
    const onPath = new Set(pathParamNames(route.path));
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
export function documentPath(path: string): string {
    return fillPathParams(path, (name) => `{${name}}`);
}

/**
 * The path params of `path` as a schema, or undefined when it has none. A param
 * the method's input declares a number is documented as that number; every
 * other param is a string.
 */
function pathParams(path: string, input: z.ZodType): z.ZodObject | undefined {
    const names = pathParamNames(path);
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
    const onUrl = new Set([...pathParamNames(route.path), ...(route.queryArgs ?? [])]);
    // A method taking `id` or `ids` is addressed one way per route: by the
    // path's `:id`, or by the body's `ids` on a bulk row.
    if (onUrl.has('id')) onUrl.add('ids');
    if (route.client === 'list') onUrl.add('id');
    const rest = Object.entries(input.shape).filter(([name]) => !onUrl.has(name));
    if (rest.length === 0) return undefined;
    // Strict, as the input is: the body refuses a key it does not declare.
    return z.strictObject(Object.fromEntries(rest));
}
