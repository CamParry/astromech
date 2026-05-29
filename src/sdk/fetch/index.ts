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
                },
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

const entriesApi: EntriesApi = {
    async query(params: EntryQueryParams & { type: string | readonly string[] }): Promise<QueryResult<Entry>> {
        const typeParam = params.type;
        const isArray = Array.isArray(typeParam);
        // Cross-type: /entries/query (no :type). Single-type: /entries/:type/query.
        const path = isArray ? '/entries/query' : `/entries/${typeParam as string}/query`;
        const body = isArray ? params : { ...params, type: undefined };
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
    }): Promise<Entry | null> {
        const res = await apiFetch<{ data: Entry } | null>(
            `/entries/${params.type}/${params.id}`,
            {
                params: {
                    populate: params.populate?.join(','),
                    locale: params.locale,
                },
            }
        );
        return res?.data ?? null;
    },

    async create(params: {
        type: string;
        title: string;
        slug?: string;
        locale?: string;
        localeGroup?: string;
        fields?: JsonObject;
        status?: EntryStatus;
        publishAt?: Date | null;
    }): Promise<Entry> {
        const { type, ...rest } = params;
        const res = await apiFetch<{ data: Entry }>(`/entries/${type}`, {
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
                `/entries/${params.type}/bulk-update`,
                { method: 'POST', body: { ids: params.id, data: params.data } }
            );
            return res.data;
        }
        const res = await apiFetch<{ data: Entry }>(
            `/entries/${params.type}/${params.id as string}`,
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
            await apiFetch<void>(`/entries/${params.type}/bulk-trash`, {
                method: 'POST',
                body: { ids: params.id, cascadeLocales: !!params.cascadeLocales },
            });
            return;
        }
        await apiFetch<void>(`/entries/${params.type}/${params.id as string}`, {
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
            `/entries/${params.type}/${params.id}/duplicate`,
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
                `/entries/${params.type}/bulk-restore`,
                { method: 'POST', body: { ids: params.id } }
            );
            return res.data;
        }
        const res = await apiFetch<{ data: Entry }>(
            `/entries/${params.type}/${params.id as string}/restore`,
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
            await apiFetch<void>(`/entries/${params.type}/bulk-delete`, {
                method: 'POST',
                body: { ids: params.id, cascadeLocales: !!params.cascadeLocales },
            });
            return;
        }
        await apiFetch<void>(`/entries/${params.type}/${params.id as string}/force`, {
            method: 'DELETE',
            ...(params.cascadeLocales ? { params: { cascadeLocales: true } } : {}),
        });
    },

    async emptyTrash(params: { type: string }): Promise<void> {
        await apiFetch<void>(`/entries/${params.type}/trash`, { method: 'DELETE' });
    },

    async versions(params: { type: string; id: string }): Promise<EntryVersion[]> {
        const res = await apiFetch<{ data: EntryVersion[] }>(
            `/entries/${params.type}/${params.id}/versions`
        );
        return res.data;
    },

    async restoreVersion(params: {
        type: string;
        id: string;
        versionId: string;
    }): Promise<Entry> {
        const res = await apiFetch<{ data: Entry }>(
            `/entries/${params.type}/${params.id}/versions/${params.versionId}/restore`,
            { method: 'POST' }
        );
        return res.data;
    },

    async incomingRelations(params: {
        type: string;
        id: string;
    }): Promise<IncomingRelation[]> {
        const res = await apiFetch<{ data: IncomingRelation[] }>(
            `/entries/${params.type}/${params.id}/incoming-relations`
        );
        return res.data;
    },

    publish: (async (params: {
        type: string;
        id: string | readonly string[];
    }): Promise<Entry | Entry[]> => {
        if (Array.isArray(params.id)) {
            const res = await apiFetch<{ data: Entry[] }>(
                `/entries/${params.type}/bulk-publish`,
                { method: 'POST', body: { ids: params.id } }
            );
            return res.data;
        }
        const res = await apiFetch<{ data: Entry }>(
            `/entries/${params.type}/${params.id as string}/publish`,
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
                `/entries/${params.type}/bulk-unpublish`,
                { method: 'POST', body: { ids: params.id } }
            );
            return res.data;
        }
        const res = await apiFetch<{ data: Entry }>(
            `/entries/${params.type}/${params.id as string}/unpublish`,
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
                `/entries/${params.type}/bulk-schedule`,
                { method: 'POST', body: { ids: params.id, publishAt: publishAtIso } }
            );
            return res.data;
        }
        const res = await apiFetch<{ data: Entry }>(
            `/entries/${params.type}/${params.id as string}/schedule`,
            { method: 'POST', body: { publishAt: publishAtIso } }
        );
        return res.data;
    }) as EntriesApi['schedule'],
};

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
                    },
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
        await apiFetch<void>(`/media/${id}`, {
            method: 'DELETE',
        });
    },
};

// ============================================================================
// Settings API Implementation
// ============================================================================

const settingsApi: SettingsApi = {
    async all(): Promise<Setting[]> {
        const res = await apiFetch<{ data: Setting[] }>('/settings');
        return res.data;
    },

    async get(key: string): Promise<JsonValue | null> {
        const res = await apiFetch<{ data: Setting } | null>(`/settings/${key}`);
        return res?.data.value ?? null;
    },

    async set(key: string, value: JsonValue): Promise<Setting> {
        const res = await apiFetch<{ data: Setting }>(`/settings/${key}`, {
            method: 'PUT',
            body: { value },
        });
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
                sort: params?.sort && !Array.isArray(params.sort) ? Object.keys(params.sort)[0] : undefined,
                dir: params?.sort && !Array.isArray(params.sort) ? Object.values(params.sort)[0] : undefined,
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
        await apiFetch<void>(`/users/${id}`, {
            method: 'DELETE',
        });
    },
};

// ============================================================================
// Plugins API — HTTP shims to /api/plugins/{name}/{method} (RPC: POST JSON)
//
// Synthesised lazily by a Proxy: no name list, no codegen. The server enforces
// existence and `access`; an unknown name/method simply 404s on call.
// ============================================================================

type FetchMethodMap = Record<string, (input?: unknown) => Promise<unknown>>;

const pluginsApi: PluginSdkNamespace = new Proxy({} as PluginSdkNamespace, {
    get(_target, nameProp): FetchMethodMap | undefined {
        if (typeof nameProp !== 'string' || nameProp === 'then') return undefined;
        const name = nameProp;
        return new Proxy({} as FetchMethodMap, {
            get(_t, methodProp) {
                if (typeof methodProp !== 'string' || methodProp === 'then') return undefined;
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
    config: null as unknown as ResolvedConfig, // Placeholder, will be set in middleware
    plugins: pluginsApi,
    configure({ baseUrl }: { baseUrl: string }): void {
        apiBase = baseUrl;
    },
};

export default Astromech;
