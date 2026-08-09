/**
 * `astromechClient` — the fetch-based client for client-side JavaScript (the
 * React admin, a browser app). Public as the named and default export of
 * `astromech/fetch`.
 *
 * It holds no URLs of its own. Every method resolves its route from
 * `routes/http-routes.shared.ts`, the same rows the server mounts and documents:
 * fill the path params from the arguments, send what is left as a query string
 * or a JSON body, and unwrap the row's envelope. A method reachable through two
 * routes (one id or a list of them) picks between them on the shape of the
 * argument, which is the only fact the row cannot state.
 *
 * The exceptions are declared, not implicit. `OVERRIDES` per domain names each
 * method that needs client-side work the table cannot describe — the admin's
 * full-shape default, a query string a service param does not match one-to-one,
 * a 404 that means "no value" — and each still gets its URL from the table.
 * `media.upload` and `media.replace` are the only methods written out end to
 * end: their body is `FormData`, so there is no row to read.
 */

import {
    HTTP_ROUTES,
    type MountedRoute,
    type ResponseEnvelope,
} from '@/transport/http/routes/http-routes.shared';
import type {
    AstromechClient,
    EntriesService,
    Media,
    MediaQueryParams,
    MediaService,
    NotificationsService,
    PluginServiceNamespace,
    ResolvedConfig,
    Setting,
    SettingsService,
    SortOption,
    TypedEntriesService,
    UserQueryParams,
    UsersService,
} from '@/types/index';

// ============================================================================
// Typed API Error
// ============================================================================

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

// ============================================================================
// Client Configuration
// ============================================================================

declare const __ASTROMECH_API_ROUTE__: string;

let apiBase =
    typeof __ASTROMECH_API_ROUTE__ !== 'undefined' ? __ASTROMECH_API_ROUTE__ : '/api';

// ============================================================================
// Error event helper
// ============================================================================

function emitApiError(err: AstromechApiError | Error): void {
    if (typeof window === 'undefined') return;
    const detail =
        err instanceof AstromechApiError
            ? { type: 'api' as const, error: err }
            : { type: 'unknown' as const, message: err.message };
    window.dispatchEvent(new CustomEvent('astromech:api-error', { detail }));
}

// ============================================================================
// Fetch Helpers
// ============================================================================

type FetchOptions = {
    method?: string;
    body?: unknown;
    params?: Record<string, unknown>;
};

function buildUrl(path: string, params?: FetchOptions['params']): string {
    // Build URL with query params - works in browser without relying on window global
    let url = `${apiBase}${path}`;

    if (params) {
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined) {
                searchParams.set(key, String(value));
            }
        }
        const queryString = searchParams.toString();
        if (queryString) {
            url += `?${queryString}`;
        }
    }

    return url;
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

// ============================================================================
// The route table, from the client's side
// ============================================================================

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
    if (list !== undefined && Array.isArray(args[list.listArg ?? 'id'])) return list;
    const single = rows.find((row) => row.client !== 'list');
    if (single === undefined) throw new Error(`No REST route for method '${id}'.`);
    return single;
}

/**
 * The route's path filled from `args`, and the arguments the path did not take.
 *
 * A path param is percent-encoded: a plugin entry type is addressed by its
 * QUALIFIED id (`redirects/redirect`), whose separator would otherwise grow a
 * segment and miss the route, and a setting key embeds both a path and a
 * `:locale` suffix. Hono decodes it back on the server, and a bare id encodes to
 * itself.
 */
function fillPath(
    route: MountedRoute,
    args: Args,
    base: string
): { path: string; rest: Args } {
    const taken = new Set<string>();
    const filled = route.path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
        taken.add(name);
        return encodeURIComponent(String(args[name] ?? ''));
    });

    const rest: Args = {};
    for (const [key, value] of Object.entries(args)) {
        if (taken.has(key) || value === undefined) continue;
        rest[route.wireNames?.[key] ?? key] = value;
    }

    return { path: filled === '/' ? base : `${base}${filled}`, rest };
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
        default:
            return undefined;
    }
}

/**
 * Call the route the table names for `id`. `base` overrides the row's mount
 * path, which is what lets an entries handle be built against another prefix.
 */
async function callRoute(id: string, args: Args = {}, base?: string): Promise<unknown> {
    const route = routeFor(id, args);
    const { path, rest } = fillPath(route, args, base ?? route.base);

    const options: FetchOptions = { method: route.verb.toUpperCase() };
    if (route.verb === 'post' || route.verb === 'put') {
        // A `bodyKey` route sends that key ALONE as the body — the rest of the
        // method's argument object is in the path.
        if (route.bodyKey !== undefined) options.body = args[route.bodyKey] ?? {};
        else if (Object.keys(rest).length > 0) options.body = rest;
    } else if (Object.keys(rest).length > 0) {
        options.params = rest;
    }

    return unwrap(route.envelope, await apiFetch<unknown>(path, options));
}

/**
 * A domain handle over the table: `<domain>.<method>(args)` resolves the route
 * for `<domain>.<method>` and calls it. `overrides` names the methods that
 * cannot be reached that way, each carrying the reason where it is declared.
 */
function restService<T extends object>(
    domain: string,
    call: Call,
    overrides: Record<string, Method>
): T {
    return new Proxy({} as T, {
        get(_target, property): Method | undefined {
            if (typeof property !== 'string' || property === 'then') return undefined;
            return (
                overrides[property] ??
                ((params?: Args) => call(`${domain}.${property}`, params))
            );
        },
    });
}

// ============================================================================
// Entries
// ============================================================================

/**
 * Create an EntriesService backed by HTTP fetch.
 *
 * `defaultShape` controls what happens when the caller omits the `full` flag on
 * read calls (`query` / `get`):
 *  - `'public'` (default): no `full` param sent → server returns public shape.
 *  - `'full'`: injects `full: true` into reads that don't specify `full`, so the
 *    admin client gets full data without annotating every call.
 *
 * An explicit per-call `full` value always wins over the client default.
 */
export function createEntriesService(
    basePath: string,
    defaultShape: 'public' | 'full' = 'public'
): EntriesService {
    const call: Call = (id, params) => callRoute(id, params ?? {}, basePath);

    /**
     * Resolve the effective `full` flag for a read call.
     * If the param object has an explicit `full` key (even `false`), use it.
     * Otherwise fall back to the client-level default.
     */
    function withFull(params: Args = {}): Args {
        const fallback = defaultShape === 'full' ? true : undefined;
        const full = 'full' in params ? params['full'] : fallback;
        return { ...params, ...(full !== undefined ? { full } : {}) };
    }

    // Only the two reads are overridden, and only for the shape default: the
    // route each takes still comes from the table.
    return restService<EntriesService>('entries', call, {
        query: (params) => call('entries.query', withFull(params)),
        get: (params) => call('entries.get', withFull(params)),
    });
}

/** Root entries API — admin fetch client defaults to full shape (authenticated admin). */
const entriesService: EntriesService = createEntriesService('/entries', 'full');

// ============================================================================
// Listing helpers
// ============================================================================

/**
 * The wire's listing params. `sort` is an object on the service and two query
 * params on the wire, and a multi-key sort has no wire form at all — the REST
 * routes have always taken one field and one direction.
 */
function listingArgs(params: {
    search?: string;
    page?: number;
    limit?: number | 'all';
    sort?: SortOption | SortOption[];
}): Args {
    const { sort, ...rest } = params;
    if (sort === undefined || Array.isArray(sort)) return { ...rest };
    return { ...rest, sort: Object.keys(sort)[0], dir: Object.values(sort)[0] };
}

// ============================================================================
// Media
// ============================================================================

/**
 * A multipart upload — the two media routes with no row in the table, because a
 * `File` has no JSON representation and so no schema either side could state.
 */
async function uploadFile(path: string, file: File): Promise<Media> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${apiBase}${path}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
    } as RequestInit);

    if (!response.ok) throw await errorFrom(response);

    const body = (await response.json()) as { data: Media };
    return body.data;
}

const mediaService = restService<MediaService>('media', callRoute, {
    // `where.mimeType` is one query param, not a nested object.
    query: (params) => {
        const { where, ...rest } = (params ?? {}) as MediaQueryParams;
        return callRoute('media.query', {
            ...listingArgs(rest),
            ...(where?.mimeType !== undefined ? { mimeType: where.mimeType } : {}),
        });
    },
    upload: (params) => uploadFile('/media/upload', (params as { file: File }).file),
    replace: (params) => {
        const { id, file } = params as { id: string; file: File };
        return uploadFile(`/media/${id}/replace`, file);
    },
});

// ============================================================================
// Settings
// ============================================================================

/** `settings.get`, with a missing setting read back as `null` rather than a 404. */
async function settingValue(key: string): Promise<Setting['value'] | null> {
    // A missing setting is a normal state, not an error: swallow the 404 so
    // react-query doesn't treat it as a failure (and retry with backoff —
    // the cause of the slow settings-page spinner).
    try {
        const setting = (await callRoute('settings.get', { key })) as Setting | null;
        return setting?.value ?? null;
    } catch (err) {
        if (err instanceof AstromechApiError && err.status === 404) return null;
        throw err;
    }
}

const settingsService = restService<SettingsService>('settings', callRoute, {
    // `full` is accepted for type compatibility; the Client is only used by
    // the authenticated admin SPA, so the HTTP endpoint always returns the full
    // set (guarded by `requireAuth` + `settings:read`). The flag is ignored on
    // the wire — the HTTP route does not yet expose a public endpoint.
    all: () => callRoute('settings.all', {}),

    get: (params) => {
        const { key, locale } = (params ?? {}) as { key: string; locale?: string };
        if (locale === undefined) return settingValue(key);
        // Base (shared) and per-locale values are independent keys — fetch
        // them concurrently rather than serially.
        return Promise.all([settingValue(key), settingValue(`${key}:${locale}`)]).then(
            ([base, localised]) => {
                if (isRecord(base) && isRecord(localised)) {
                    return { ...base, ...localised };
                }
                return localised ?? base;
            }
        );
    },
});

/** A JSON object, as opposed to an array or a scalar — the shape locales merge. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ============================================================================
// Users
// ============================================================================

const usersService = restService<UsersService>('users', callRoute, {
    query: (params) =>
        callRoute('users.query', listingArgs((params ?? {}) as UserQueryParams)),
});

// ============================================================================
// Notifications
// ============================================================================

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

// ============================================================================
// Plugins API — HTTP shims to /api/plugins/{name}/{method} (RPC: POST JSON)
//
// Synthesised lazily by a Proxy: no name list, no codegen. The server enforces
// existence and `access`; an unknown name/method simply 404s on call.
// ============================================================================

type FetchMethodMap = Record<string, (input?: unknown) => Promise<unknown>>;

const pluginsApi: PluginServiceNamespace = new Proxy({} as PluginServiceNamespace, {
    get(_target, nameProp): FetchMethodMap | undefined {
        if (typeof nameProp !== 'string' || nameProp === 'then') return undefined;
        // The property key IS the route segment: plugin routes mount under the
        // plugin's service key (`acmeSeo`), so there is nothing to transform here.
        // Routes deliberately do not mount under the namespace (`acme_seo`) —
        // deriving one from the other on this side would mean inverting a lossy
        // mapping (`acme_2fa` → `acme2fa` → ?).
        const name = nameProp;
        return new Proxy({} as FetchMethodMap, {
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
        });
    },
});

// ============================================================================
// Export Client
// ============================================================================

export const astromechClient: AstromechClient = {
    entries: entriesService as unknown as TypedEntriesService,
    media: mediaService,
    settings: settingsService,
    users: usersService,
    notifications: notificationsService,
    config: null as unknown as ResolvedConfig, // Placeholder, will be set in middleware
    plugins: pluginsApi,
    configure({ baseUrl }: { baseUrl: string }): void {
        apiBase = baseUrl;
    },
};

export default astromechClient;
