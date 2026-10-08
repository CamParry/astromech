/**
 * `astromechClient` — the fetch-based client for client-side JavaScript,
 * exported from `astromech/fetch`. It holds no URLs of its own: every method
 * resolves its route from `routes/http-routes.ts` and unwraps the envelope.
 */

import type { EntriesService } from '@/entries/service-types';
import type { GlobalsService } from '@/globals/service-types';
import type { MediaService } from '@/media/service-types';
import type { NotificationsService } from '@/notifications/service-types';
import type { SecurityService } from '@/security/service-types';
import type { MountedRoute, ResponseEnvelope } from '@/transport/http/routes/http-routes';
import type { Media, PluginServiceNamespace } from '@/types/index';
import type { UsersService } from '@/users/service-types';
import { typedServices } from '@/services/typed-services';
import { fillPathParams, HTTP_ROUTES } from '@/transport/http/routes/http-routes';
import { toQueryParams } from '@/transport/http/routes/query-string';

/** A non-2xx response, carrying the error envelope's id, code and status. */
export class AstromechApiError extends Error {
    readonly id: string;
    readonly code: string;
    readonly status: number;
    readonly details?: Record<string, unknown>;

    constructor(payload: {
        id: string;
        code: string;
        message: string;
        status: number;
        details?: Record<string, unknown>;
    }) {
        super(payload.message);
        this.name = 'AstromechApiError';
        this.id = payload.id;
        this.code = payload.code;
        this.status = payload.status;
        if (payload.details !== undefined) {
            this.details = payload.details;
        }
    }
}

declare const __ASTROMECH_BASE_PATH__: string;

let apiBase = `${typeof __ASTROMECH_BASE_PATH__ !== 'undefined' ? __ASTROMECH_BASE_PATH__ : '/cms'}/api`;

function emitApiError(err: AstromechApiError | Error): void {
    if (typeof window === 'undefined') return;
    const detail =
        err instanceof AstromechApiError
            ? { type: 'api' as const, error: err }
            : { type: 'unknown' as const, message: err.message };
    window.dispatchEvent(new CustomEvent('astromech:api-error', { detail }));
}

type FetchOptions = {
    method?: string;
    body?: unknown;
    params?: Record<string, string>;
};

/** The API URL for `path`, with `params` as its query string. */
function buildUrl(path: string, params?: FetchOptions['params']): string {
    const query = new URLSearchParams(params).toString();
    return `${apiBase}${path}${query ? `?${query}` : ''}`;
}

/**
 * The error a failed response carries: the canonical `{ error }` body as an
 * `AstromechApiError`, anything else as the bare status. Emitted as a window
 * event on the way out, so the admin's error surface sees every failure.
 */
async function errorFrom(response: Response): Promise<Error> {
    const body = await response.json().catch(() => null);
    const payload = (body as Record<string, unknown> | null)?.error;
    if (
        payload !== null &&
        payload !== undefined &&
        typeof payload === 'object' &&
        'code' in payload
    ) {
        const apiErr = new AstromechApiError(
            payload as {
                id: string;
                code: string;
                message: string;
                status: number;
                details?: Record<string, unknown>;
            }
        );
        emitApiError(apiErr);
        return apiErr;
    }
    const httpErr = new Error(`HTTP ${response.status}`);
    emitApiError(httpErr);
    return httpErr;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const url = buildUrl(path, options.params);

    const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: options.body ? JSON.stringify(options.body) : undefined,
    } as RequestInit);

    if (!response.ok) throw await errorFrom(response);

    // A 204 has no body to parse; the routes that answer one return nothing.
    if (response.status === 204) return undefined as T;

    return response.json() as Promise<T>;
}

type Args = Record<string, unknown>;

/** A service method as the proxy sees it: one optional argument object. */
type Method = (params?: Args) => Promise<unknown>;

/** Calls a method id with its arguments — a domain handle's only dependency. */
type Call = (id: string, params?: Args) => Promise<unknown>;

/**
 * The route this call takes. A method with two rows has one for a single
 * addressed id and one for a list; the row says which argument may be the list,
 * and the call's own arguments decide.
 */
function routeFor(id: string, args: Args): MountedRoute {
    const rows = HTTP_ROUTES.filter((row) => row.id === id && row.client !== 'none');
    const list = rows.find((row) => row.client === 'list');
    if (list !== undefined && Array.isArray(args[list.listArg ?? 'ids'])) return list;
    const single = rows.find((row) => row.client !== 'list');
    if (single === undefined) throw new Error(`No REST route for method '${id}'.`);
    return single;
}

/**
 * The route's path filled from `args`, and the arguments the path did not take.
 *
 * A path param is percent-encoded: a plugin entry type is addressed by its
 * QUALIFIED id (`forms/form`), whose separator would otherwise grow a
 * segment and miss the route, and a plugin global's key (`seo/settings`) has
 * the same separator. Hono decodes it back on the server, and a bare id encodes
 * to itself.
 */
function fillPath(route: MountedRoute, args: Args): { path: string; rest: Args } {
    const taken = new Set<string>();
    const filled = fillPathParams(route.path, (name) => {
        taken.add(name);
        return encodeURIComponent(String(args[name] ?? ''));
    });

    const rest: Args = {};
    for (const [key, value] of Object.entries(args)) {
        if (taken.has(key) || value === undefined) continue;
        rest[key] = value;
    }

    return { path: filled === '/' ? route.base : `${route.base}${filled}`, rest };
}

/** Split what the path did not take into the route's query params and its body. */
function splitQueryArgs(route: MountedRoute, rest: Args): { query: Args; body: Args } {
    const names = new Set(route.queryArgs ?? []);
    const query: Args = {};
    const body: Args = {};
    for (const [key, value] of Object.entries(rest)) {
        if (names.has(key)) query[key] = value;
        else body[key] = value;
    }
    return { query, body };
}

/** Read the row's envelope off a response payload. */
function unwrap(envelope: ResponseEnvelope | undefined, payload: unknown): unknown {
    switch (envelope ?? 'data') {
        case 'data':
            return (payload as { data?: unknown } | null)?.data ?? null;
        case 'raw':
            return payload;
        // `{ success: true }` and 204 both mean "it worked"; the methods that
        // answer with one return void.
        case 'success':
        case 'empty':
            return undefined;
    }
}

/** Call the route the table names for `id`. */
async function callRoute(id: string, args: Args = {}): Promise<unknown> {
    const route = routeFor(id, args);
    const { path, rest } = fillPath(route, args);

    const options: FetchOptions = { method: route.verb.toUpperCase() };
    if (route.verb === 'post' || route.verb === 'put') {
        // `queryArgs` go on the URL whatever the body is — a content-level route
        // addresses its locale there, next to the id.
        const { query, body } = splitQueryArgs(route, rest);
        if (Object.keys(query).length > 0) options.params = toQueryParams(query);
        // A `bodyKey` route sends that key ALONE as the body — the rest of the
        // method's argument object is on the URL.
        if (route.bodyKey !== undefined) options.body = args[route.bodyKey] ?? {};
        else if (Object.keys(body).length > 0) options.body = body;
    } else if (Object.keys(rest).length > 0) {
        // Every argument a GET or DELETE did not spend on the path is a query
        // param, so `queryArgs` has nothing to say here.
        options.params = toQueryParams(rest);
    }

    return unwrap(route.envelope, await apiFetch<unknown>(path, options));
}

/**
 * A module handle over the table: `<module>.<method>(args)` resolves the route
 * for `<module>.<method>` and calls it. `overrides` names the methods that
 * cannot be reached that way, each carrying the reason where it is declared.
 */
function restService<T extends object>(
    module: string,
    call: Call,
    overrides: Record<string, Method>
): T {
    return new Proxy({} as T, {
        get(_target, property): Method | undefined {
            if (typeof property !== 'string' || property === 'then') return undefined;
            return (
                overrides[property] ??
                ((params?: Args) => call(`${module}.${property}`, params))
            );
        },
    });
}

/**
 * A read that does not name `full` asks for the full shape, so the admin gets
 * full data without annotating every call. An explicit `full` (even `false`)
 * is sent as given.
 */
function withFull(params: Args = {}): Args {
    return 'full' in params ? params : { ...params, full: true };
}

// Only the reads are overridden, and only for the shape default: the route each
// takes still comes from the table.
const entriesService = restService<EntriesService>('entries', callRoute, {
    query: (params) => callRoute('entries.query', withFull(params)),
    count: (params) => callRoute('entries.count', withFull(params)),
    get: (params) => callRoute('entries.get', withFull(params)),
});

/**
 * A multipart upload — the two media routes with no row in the table, because a
 * `File` has no JSON representation and so no schema either side could state.
 * An upload's `data` travels as a JSON-encoded form part.
 */
async function uploadFile(
    path: string,
    file: File,
    data?: Parameters<MediaService['upload']>[0]['data']
): Promise<Media> {
    const formData = new FormData();
    formData.append('file', file);
    if (data !== undefined) formData.append('data', JSON.stringify(data));

    const response = await fetch(`${apiBase}${path}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
    });

    if (!response.ok) throw await errorFrom(response);

    const body = (await response.json()) as { data: Media };
    return body.data;
}

const mediaService = restService<MediaService>('media', callRoute, {
    upload: (params) => {
        const { file, data } = params as Parameters<MediaService['upload']>[0];
        return uploadFile('/media', file, data);
    },
    replace: (params) => {
        const { id, file } = params as { id: string; file: File };
        return uploadFile(`/media/${id}/replace`, file);
    },
});

/**
 * Globals over the table. `get` is the one override: a global that has never
 * been saved is a normal state, and the route answers 404 for it, so the client
 * reads it back as `null` rather than raising.
 */
const globalsService = restService<GlobalsService>('globals', callRoute, {
    get: async (params) => {
        try {
            return await callRoute('globals.get', params ?? {});
        } catch (err) {
            if (err instanceof AstromechApiError && err.status === 404) return null;
            throw err;
        }
    },
});

const usersService = restService<UsersService>('users', callRoute, {});

const notificationsService = restService<NotificationsService>(
    'notifications',
    callRoute,
    {
        // The route answers `{ data: { count } }`; the method returns the scalar.
        count: async () => {
            const data = (await callRoute('notifications.count', {})) as {
                count: number;
            };
            return data.count;
        },
    }
);

const securityService = restService<SecurityService>('security', callRoute, {});

/**
 * Plugins API — HTTP shims to /api/plugins/{name}/{method} (RPC: POST JSON).
 * Synthesised lazily by a Proxy: no name list, no codegen. An unknown
 * name/method simply 404s on call; the server enforces existence and `access`.
 */
type FetchMethodMap = Record<string, (input?: unknown) => Promise<unknown>>;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- a plugin augments `PluginServiceNamespace`, and in its program `{}` is not one
const pluginsApi: PluginServiceNamespace = new Proxy({} as PluginServiceNamespace, {
    get(_target, nameProp): FetchMethodMap | undefined {
        if (typeof nameProp !== 'string' || nameProp === 'then') return undefined;
        // The property key IS the route segment: plugin routes mount under the
        // plugin's service key (`acmeSeo`), so there is nothing to transform here.
        // Routes deliberately do not mount under the namespace (`acme_seo`) —
        // deriving one from the other on this side would mean inverting a lossy
        // mapping (`acme_2fa` → `acme2fa` → ?).
        const name = nameProp;
        return new Proxy(
            {},
            {
                get(_t, methodProp) {
                    if (typeof methodProp !== 'string' || methodProp === 'then')
                        return undefined;
                    const method = methodProp;
                    return (input?: unknown) =>
                        apiFetch<unknown>(`/plugins/${name}/${method}`, {
                            method: 'POST',
                            body: input ?? {},
                        });
                },
            }
        );
    },
});

/**
 * The client with `entries` and `globals` typed as the wide services, for code
 * that addresses entry types and globals by a runtime string, such as the
 * admin. Same object as `astromechClient`.
 */
export const astromechUntypedClient = {
    entries: entriesService,
    globals: globalsService,
    media: mediaService,
    users: usersService,
    notifications: notificationsService,
    security: securityService,
    plugins: pluginsApi,
    /** Point the client at an API base other than the default. */
    configure({ baseUrl }: { baseUrl: string }): void {
        apiBase = baseUrl;
    },
};

/** The client, with `entries` and `globals` under their typed facades. */
export const astromechClient = typedServices(astromechUntypedClient);

export default astromechClient;
