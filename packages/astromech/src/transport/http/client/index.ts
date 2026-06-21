/**
 * Astromech Client
 *
 * Fetch-based client for use in client-side JavaScript (React admin, etc.)
 * Import from 'astromech/fetch'
 */

import type {
    AstromechClient,
    EntriesApi,
    Entry,
    EntryDuplicateOverrides,
    EntryQueryParams,
    EntryUpdateData,
    QueryResult,
    EntryStatus,
    EntryVersion,
    IncomingRelation,
    JsonObject,
    JsonValue,
    Media,
    MediaApi,
    MediaQueryParams,
    Notification,
    NotificationsApi,
    PluginSdkNamespace,
    ResolvedConfig,
    Setting,
    SettingsApi,
    TypedEntriesApi,
    User,
    UserQueryParams,
    UsersApi,
} from '@/types/index.js';

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
    params?: Record<string, string | number | boolean | undefined>;
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

    if (!response.ok) {
        const body = await response.json().catch(() => null);
        const errPayload = (body as Record<string, unknown> | null)?.error;
        if (
            errPayload !== null &&
            errPayload !== undefined &&
            typeof errPayload === 'object' &&
            'code' in errPayload
        ) {
            const apiErr = new AstromechApiError(
                errPayload as {
                    id: string;
                    code: string;
                    message: string;
                    status: number;
                    details?: Record<string, unknown>;
                }
            );
            emitApiError(apiErr);
            throw apiErr;
        }
        const httpErr = new Error(`HTTP ${response.status}`);
        emitApiError(httpErr);
        throw httpErr;
    }

    return response.json() as Promise<T>;
}

// ============================================================================
// Entries API Implementation
// ============================================================================

/**
 * Create an EntriesApi backed by HTTP fetch.
 *
 * `defaultShape` controls what happens when the caller omits the `full` flag on
 * read calls (`query` / `get`):
 *  - `'public'` (default): no `full` param sent → server returns public shape.
 *  - `'full'`: injects `full: true` into reads that don't specify `full`, so the
 *    admin client gets full data without annotating every call.
 *
 * An explicit per-call `full` value always wins over the client default.
 */
export function createEntriesApi(
    basePath: string,
    defaultShape: 'public' | 'full' = 'public'
): EntriesApi {
    /**
     * Resolve the effective `full` flag for a read call.
     * If the param object has an explicit `full` key (even `false`), use it.
     * Otherwise fall back to the client-level default.
     */
    function effectiveFull(params: { full?: boolean }): boolean | undefined {
        if ('full' in params) return params.full;
        return defaultShape === 'full' ? true : undefined;
    }

    return {
        async query(
            params: EntryQueryParams & { type: string | readonly string[] }
        ): Promise<QueryResult<Entry>> {
            const typeParam = params.type;
            const isArray = Array.isArray(typeParam);
            // Cross-type: /entries/query (no :type). Single-type: /entries/:type/query.
            const path = isArray
                ? `${basePath}/query`
                : `${basePath}/${typeParam as string}/query`;
            const full = effectiveFull(params);
            const body = isArray
                ? { ...params, ...(full !== undefined ? { full } : {}) }
                : { ...params, type: undefined, ...(full !== undefined ? { full } : {}) };
            return apiFetch<QueryResult<Entry>>(path, {
                method: 'POST',
                body,
            });
        },

        async get(params: {
            type: string;
            id: string;
            locale?: string;
            populate?: string[];
            full?: boolean;
            previewToken?: string;
            staged?: boolean;
        }): Promise<Entry | null> {
            const full = effectiveFull(params);
            const res = await apiFetch<{ data: Entry } | null>(
                `${basePath}/${params.type}/${params.id}`,
                {
                    params: {
                        populate: params.populate?.join(','),
                        locale: params.locale,
                        ...(full !== undefined ? { full } : {}),
                        ...(params.previewToken !== undefined
                            ? { previewToken: params.previewToken }
                            : {}),
                        ...(params.staged ? { staged: true } : {}),
                    },
                }
            );
            return res?.data ?? null;
        },

        async create(params: {
            type: string;
            /** Optional for `titleField: false` types; runtime-enforced otherwise. */
            title?: string;
            slug?: string;
            locale?: string;
            localeGroup?: string;
            fields?: JsonObject;
            status?: EntryStatus;
            publishAt?: Date | null;
        }): Promise<Entry> {
            const { type, ...rest } = params;
            const res = await apiFetch<{ data: Entry }>(`${basePath}/${type}`, {
                method: 'POST',
                body: rest,
            });
            return res.data;
        },

        update: (async (params: {
            type: string;
            id: string | readonly string[];
            data: EntryUpdateData;
        }): Promise<Entry | Entry[]> => {
            if (Array.isArray(params.id)) {
                const res = await apiFetch<{ data: Entry[] }>(
                    `${basePath}/${params.type}/bulk-update`,
                    { method: 'POST', body: { ids: params.id, data: params.data } }
                );
                return res.data;
            }
            const res = await apiFetch<{ data: Entry }>(
                `${basePath}/${params.type}/${params.id as string}`,
                { method: 'PUT', body: params.data }
            );
            return res.data;
        }) as EntriesApi['update'],

        async trash(params: {
            type: string;
            id: string | readonly string[];
            cascadeLocales?: boolean;
        }): Promise<void> {
            if (Array.isArray(params.id)) {
                await apiFetch<unknown>(`${basePath}/${params.type}/bulk-trash`, {
                    method: 'POST',
                    body: { ids: params.id, cascadeLocales: !!params.cascadeLocales },
                });
                return;
            }
            await apiFetch<unknown>(`${basePath}/${params.type}/${params.id as string}`, {
                method: 'DELETE',
                ...(params.cascadeLocales ? { params: { cascadeLocales: true } } : {}),
            });
        },

        async duplicate(params: {
            type: string;
            id: string;
            overrides?: EntryDuplicateOverrides;
        }): Promise<Entry> {
            const res = await apiFetch<{ data: Entry }>(
                `${basePath}/${params.type}/${params.id}/duplicate`,
                { method: 'POST', body: params.overrides ?? {} }
            );
            return res.data;
        },

        restore: (async (params: {
            type: string;
            id: string | readonly string[];
        }): Promise<Entry | Entry[]> => {
            if (Array.isArray(params.id)) {
                const res = await apiFetch<{ data: Entry[] }>(
                    `${basePath}/${params.type}/bulk-restore`,
                    { method: 'POST', body: { ids: params.id } }
                );
                return res.data;
            }
            const res = await apiFetch<{ data: Entry }>(
                `${basePath}/${params.type}/${params.id as string}/restore`,
                { method: 'POST' }
            );
            return res.data;
        }) as EntriesApi['restore'],

        async delete(params: {
            type: string;
            id: string | readonly string[];
            cascadeLocales?: boolean;
        }): Promise<void> {
            if (Array.isArray(params.id)) {
                await apiFetch<unknown>(`${basePath}/${params.type}/bulk-delete`, {
                    method: 'POST',
                    body: { ids: params.id, cascadeLocales: !!params.cascadeLocales },
                });
                return;
            }
            await apiFetch<unknown>(
                `${basePath}/${params.type}/${params.id as string}/force`,
                {
                    method: 'DELETE',
                    ...(params.cascadeLocales
                        ? { params: { cascadeLocales: true } }
                        : {}),
                }
            );
        },

        async emptyTrash(params: { type: string }): Promise<void> {
            await apiFetch<unknown>(`${basePath}/${params.type}/trash`, {
                method: 'DELETE',
            });
        },

        async versions(params: { type: string; id: string }): Promise<EntryVersion[]> {
            const res = await apiFetch<{ data: EntryVersion[] }>(
                `${basePath}/${params.type}/${params.id}/versions`
            );
            return res.data;
        },

        async restoreVersion(params: {
            type: string;
            id: string;
            versionId: string;
        }): Promise<Entry> {
            const res = await apiFetch<{ data: Entry }>(
                `${basePath}/${params.type}/${params.id}/versions/${params.versionId}/restore`,
                { method: 'POST' }
            );
            return res.data;
        },

        async incomingRelations(params: {
            type: string;
            id: string;
        }): Promise<IncomingRelation[]> {
            const res = await apiFetch<{ data: IncomingRelation[] }>(
                `${basePath}/${params.type}/${params.id}/incoming-relations`
            );
            return res.data;
        },

        publish: (async (params: {
            type: string;
            id: string | readonly string[];
        }): Promise<Entry | Entry[]> => {
            if (Array.isArray(params.id)) {
                const res = await apiFetch<{ data: Entry[] }>(
                    `${basePath}/${params.type}/bulk-publish`,
                    { method: 'POST', body: { ids: params.id } }
                );
                return res.data;
            }
            const res = await apiFetch<{ data: Entry }>(
                `${basePath}/${params.type}/${params.id as string}/publish`,
                { method: 'POST' }
            );
            return res.data;
        }) as EntriesApi['publish'],

        unpublish: (async (params: {
            type: string;
            id: string | readonly string[];
        }): Promise<Entry | Entry[]> => {
            if (Array.isArray(params.id)) {
                const res = await apiFetch<{ data: Entry[] }>(
                    `${basePath}/${params.type}/bulk-unpublish`,
                    { method: 'POST', body: { ids: params.id } }
                );
                return res.data;
            }
            const res = await apiFetch<{ data: Entry }>(
                `${basePath}/${params.type}/${params.id as string}/unpublish`,
                { method: 'POST' }
            );
            return res.data;
        }) as EntriesApi['unpublish'],

        schedule: (async (params: {
            type: string;
            id: string | readonly string[];
            publishAt: Date;
        }): Promise<Entry | Entry[]> => {
            const publishAtIso = params.publishAt.toISOString();
            if (Array.isArray(params.id)) {
                const res = await apiFetch<{ data: Entry[] }>(
                    `${basePath}/${params.type}/bulk-schedule`,
                    { method: 'POST', body: { ids: params.id, publishAt: publishAtIso } }
                );
                return res.data;
            }
            const res = await apiFetch<{ data: Entry }>(
                `${basePath}/${params.type}/${params.id as string}/schedule`,
                { method: 'POST', body: { publishAt: publishAtIso } }
            );
            return res.data;
        }) as EntriesApi['schedule'],

        // ── Forward versioning (staged entries) ────────────────────────────
        async createStaged(params: { type: string; id: string }): Promise<Entry> {
            const res = await apiFetch<{ data: Entry }>(
                `${basePath}/${params.type}/${params.id}/staged`,
                { method: 'POST' }
            );
            return res.data;
        },

        async getStaged(params: { type: string; id: string }): Promise<Entry | null> {
            const res = await apiFetch<{ data: Entry } | null>(
                `${basePath}/${params.type}/${params.id}/staged`
            );
            return res?.data ?? null;
        },

        async mergeStaged(params: { type: string; id: string }): Promise<Entry> {
            const res = await apiFetch<{ data: Entry }>(
                `${basePath}/${params.type}/${params.id}/staged/merge`,
                { method: 'POST' }
            );
            return res.data;
        },

        async deleteStaged(params: { type: string; id: string }): Promise<void> {
            await apiFetch<unknown>(`${basePath}/${params.type}/${params.id}/staged`, {
                method: 'DELETE',
            });
        },

        async issuePreviewToken(params: {
            type: string;
            id: string;
            expiresAt?: Date | null;
        }): Promise<{ token: string }> {
            const res = await apiFetch<{ data: { token: string } }>(
                `${basePath}/${params.type}/${params.id}/preview-token`,
                {
                    method: 'POST',
                    body: {
                        expiresAt:
                            params.expiresAt instanceof Date
                                ? params.expiresAt.toISOString()
                                : (params.expiresAt ?? null),
                    },
                }
            );
            return res.data;
        },

        async revokePreviewToken(params: { type: string; id: string }): Promise<void> {
            await apiFetch<unknown>(
                `${basePath}/${params.type}/${params.id}/preview-token`,
                { method: 'DELETE' }
            );
        },
    };
}

/** Root entries API — admin fetch client defaults to full shape (authenticated admin). */
const entriesApi: EntriesApi = createEntriesApi('/entries', 'full');

// ============================================================================
// Media API Implementation
// ============================================================================

const mediaApi: MediaApi = {
    async query(params?: MediaQueryParams): Promise<QueryResult<Media>> {
        return apiFetch<QueryResult<Media>>('/media', {
            params: {
                search: params?.search,
                mimeType: params?.where?.mimeType,
                page: params?.page,
                limit: params?.limit,
            },
        });
    },

    async get(id: string): Promise<Media | null> {
        const res = await apiFetch<{ data: Media } | null>(`/media/${id}`);
        return res?.data ?? null;
    },

    async upload(file: File): Promise<Media> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${apiBase}/media`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
        } as RequestInit);

        if (!response.ok) {
            const body = await response.json().catch(() => null);
            const errPayload = (body as Record<string, unknown> | null)?.error;
            if (
                errPayload !== null &&
                errPayload !== undefined &&
                typeof errPayload === 'object' &&
                'code' in errPayload
            ) {
                const apiErr = new AstromechApiError(
                    errPayload as {
                        id: string;
                        code: string;
                        message: string;
                        status: number;
                        details?: Record<string, unknown>;
                    }
                );
                emitApiError(apiErr);
                throw apiErr;
            }
            const httpErr = new Error(`HTTP ${response.status}`);
            emitApiError(httpErr);
            throw httpErr;
        }

        const body = (await response.json()) as { data: Media };
        return body.data;
    },

    async update(
        id: string,
        data: Partial<{ alt: string; fields: JsonObject }>
    ): Promise<Media> {
        const res = await apiFetch<{ data: Media }>(`/media/${id}`, {
            method: 'PUT',
            body: data,
        });
        return res.data;
    },

    async delete(id: string): Promise<void> {
        await apiFetch<unknown>(`/media/${id}`, {
            method: 'DELETE',
        });
    },
};

// ============================================================================
// Settings API Implementation
// ============================================================================

const settingsApi: SettingsApi = {
    // `full` is accepted for type compatibility; the Client is only used by
    // the authenticated admin SPA, so the HTTP endpoint always returns the full
    // set (guarded by `requireAuth` + `settings:read`). The flag is ignored on
    // the wire — the HTTP route does not yet expose a public endpoint.
    async all(_opts?: { full?: boolean }): Promise<Setting[]> {
        const res = await apiFetch<{ data: Setting[] }>('/settings');
        return res.data;
    },

    async get(
        key: string,
        opts?: { locale?: string; full?: boolean }
    ): Promise<JsonValue | null> {
        // A missing setting is a normal state, not an error: swallow the 404 so
        // react-query doesn't treat it as a failure (and retry with backoff —
        // the cause of the slow settings-page spinner).
        const getValue = async (k: string): Promise<JsonValue | null> => {
            try {
                // Keys embed a path (`plugin:<ns>:/menus/main`) and a `:locale`
                // suffix — encode so slashes/colons stay in one path segment and
                // match the `/settings/:key` route (the server decodes it back).
                const res = await apiFetch<{ data: Setting }>(
                    `/settings/${encodeURIComponent(k)}`
                );
                return res.data.value ?? null;
            } catch (err) {
                if (err instanceof AstromechApiError && err.status === 404) return null;
                throw err;
            }
        };

        if (opts?.locale) {
            // Base (shared) and per-locale values are independent keys — fetch
            // them concurrently rather than serially.
            const [base, loc] = await Promise.all([
                getValue(key),
                getValue(`${key}:${opts.locale}`),
            ]);
            if (
                base !== null &&
                typeof base === 'object' &&
                !Array.isArray(base) &&
                loc !== null &&
                typeof loc === 'object' &&
                !Array.isArray(loc)
            ) {
                return {
                    ...(base as Record<string, JsonValue>),
                    ...(loc as Record<string, JsonValue>),
                };
            }
            return loc ?? base;
        }
        return getValue(key);
    },

    async set(key: string, value: JsonValue): Promise<Setting> {
        const res = await apiFetch<{ data: Setting }>(
            `/settings/${encodeURIComponent(key)}`,
            {
                method: 'PUT',
                body: { value },
            }
        );
        return res.data;
    },
};

// ============================================================================
// Users API Implementation
// ============================================================================

const usersApi: UsersApi = {
    async query(params?: UserQueryParams): Promise<QueryResult<User>> {
        return apiFetch<QueryResult<User>>('/users', {
            params: {
                search: params?.search,
                page: params?.page,
                limit: params?.limit,
                sort:
                    params?.sort && !Array.isArray(params.sort)
                        ? Object.keys(params.sort)[0]
                        : undefined,
                dir:
                    params?.sort && !Array.isArray(params.sort)
                        ? Object.values(params.sort)[0]
                        : undefined,
            },
        });
    },

    async get(id: string): Promise<User | null> {
        const res = await apiFetch<{ data: User } | null>(`/users/${id}`);
        return res?.data ?? null;
    },

    async create(data: {
        email: string;
        name?: string;
        roleSlug?: string;
    }): Promise<User> {
        const res = await apiFetch<{ data: User }>('/users', {
            method: 'POST',
            body: data,
        });
        return res.data;
    },

    async update(
        id: string,
        data: Partial<{ name: string; roleSlug: string; fields: JsonObject }>
    ): Promise<User> {
        const res = await apiFetch<{ data: User }>(`/users/${id}`, {
            method: 'PUT',
            body: data,
        });
        return res.data;
    },

    async delete(id: string): Promise<void> {
        await apiFetch<unknown>(`/users/${id}`, {
            method: 'DELETE',
        });
    },
};

// ============================================================================
// Notifications API Implementation
// ============================================================================

const notificationsApi: NotificationsApi = {
    async list(): Promise<Notification[]> {
        const res = await apiFetch<{ data: Notification[] }>('/notifications');
        return res.data;
    },

    async count(): Promise<number> {
        const res = await apiFetch<{ data: { count: number } }>('/notifications/count');
        return res.data.count;
    },

    async dismiss(id: string): Promise<void> {
        await apiFetch<unknown>(`/notifications/${id}`, { method: 'DELETE' });
    },

    async dismissAll(): Promise<void> {
        await apiFetch<unknown>('/notifications', { method: 'DELETE' });
    },
};

// ============================================================================
// Plugins API — HTTP shims to /api/plugins/{name}/{method} (RPC: POST JSON)
//
// Synthesised lazily by a Proxy: no name list, no codegen. The server enforces
// existence and `access`; an unknown name/method simply 404s on call.
// ============================================================================

type FetchMethodMap = Record<string, (input?: unknown) => Promise<unknown>>;

// One entries API per plugin name (paths rooted at `/plugins/{name}/entries`).
const pluginEntriesCache = new Map<string, EntriesApi>();

function pluginEntriesApi(name: string): EntriesApi {
    let api = pluginEntriesCache.get(name);
    if (!api) {
        api = createEntriesApi(`/plugins/${name}/entries`, 'full');
        pluginEntriesCache.set(name, api);
    }
    return api;
}

const pluginsApi: PluginSdkNamespace = new Proxy({} as PluginSdkNamespace, {
    get(_target, nameProp): FetchMethodMap | EntriesApi | undefined {
        if (typeof nameProp !== 'string' || nameProp === 'then') return undefined;
        const name = nameProp;
        return new Proxy({} as FetchMethodMap, {
            get(_t, methodProp) {
                if (typeof methodProp !== 'string' || methodProp === 'then')
                    return undefined;
                // `entries` is a reserved key: the per-plugin entries sub-API,
                // not an RPC method.
                if (methodProp === 'entries') return pluginEntriesApi(name);
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

export const Astromech: AstromechClient = {
    entries: entriesApi as unknown as TypedEntriesApi,
    media: mediaApi,
    settings: settingsApi,
    users: usersApi,
    notifications: notificationsApi,
    config: null as unknown as ResolvedConfig, // Placeholder, will be set in middleware
    plugins: pluginsApi,
    configure({ baseUrl }: { baseUrl: string }): void {
        apiBase = baseUrl;
    },
};

export default Astromech;
