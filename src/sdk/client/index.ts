/**
 * Astromech Client
 *
 * Fetch-based client for use in client-side JavaScript (React admin, etc.)
 * Import from 'astromech/client'
 */

import type {
    AstromechClient,
    CollectionApi,
    Entry,
    EntryStatus,
    EntryVersion,
    JsonObject,
    JsonValue,
    Media,
    MediaApi,
    MediaListParams,
    MediaListResult,
    PaginationResult,
    QueryOptions,
    ResolvedConfig,
    Setting,
    SettingsApi,
    TranslationInfo,
    TypedCollectionsProxy,
    User,
    UsersApi,
    WhereFilters,
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
    typeof __ASTROMECH_API_ROUTE__ !== 'undefined' ? __ASTROMECH_API_ROUTE__ : '/api/cms';

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
// Collection API Implementation
// ============================================================================

function createCollectionApi(collectionId: string): CollectionApi {
    const basePath = `/collections/${collectionId}`;

    return {
        async all(options?: QueryOptions): Promise<Entry[]> {
            const sort = Array.isArray(options?.sort) ? options.sort[0] : options?.sort;
            return apiFetch<Entry[]>(basePath, {
                params: {
                    populate: options?.populate?.join(','),
                    locale: options?.locale,
                    withTrashed: options?.withTrashed,
                    sort: sort?.field,
                    dir: sort?.direction,
                },
            });
        },

        async paginate(
            perPage: number,
            page: number,
            options?: QueryOptions
        ): Promise<PaginationResult<Entry>> {
            const sort = Array.isArray(options?.sort) ? options.sort[0] : options?.sort;
            return apiFetch<PaginationResult<Entry>>(basePath, {
                params: {
                    perPage,
                    page,
                    populate: options?.populate?.join(','),
                    locale: options?.locale,
                    withTrashed: options?.withTrashed,
                    sort: sort?.field,
                    dir: sort?.direction,
                },
            });
        },

        async get(id: string, options?: QueryOptions): Promise<Entry | null> {
            const res = await apiFetch<{ data: Entry } | null>(`${basePath}/${id}`, {
                params: {
                    populate: options?.populate?.join(','),
                    locale: options?.locale,
                },
            });
            return res?.data ?? null;
        },

        async where(filters: WhereFilters, options?: QueryOptions): Promise<Entry[]> {
            return apiFetch<Entry[]>(`${basePath}/query`, {
                method: 'POST',
                body: { filters, options },
            });
        },

        async create(data: {
            title: string;
            slug?: string;
            fields?: JsonObject;
            status?: EntryStatus;
            publishAt?: Date | null;
        }): Promise<Entry> {
            const res = await apiFetch<{ data: Entry }>(basePath, {
                method: 'POST',
                body: data,
            });
            return res.data;
        },

        async update(
            id: string,
            data: Partial<{
                title: string;
                slug: string;
                fields: JsonObject;
                status: EntryStatus;
                publishAt: Date | null;
            }>
        ): Promise<Entry> {
            const res = await apiFetch<{ data: Entry }>(`${basePath}/${id}`, {
                method: 'PUT',
                body: data,
            });
            return res.data;
        },

        async trash(id: string): Promise<void> {
            await apiFetch<void>(`${basePath}/${id}`, {
                method: 'DELETE',
            });
        },

        async duplicate(id: string): Promise<Entry> {
            const res = await apiFetch<{ data: Entry }>(`${basePath}/${id}/duplicate`, {
                method: 'POST',
            });
            return res.data;
        },

        async trashed(options?: QueryOptions): Promise<Entry[]> {
            return apiFetch<Entry[]>(`${basePath}/trashed`, {
                params: {
                    locale: options?.locale,
                },
            });
        },

        async restore(id: string): Promise<Entry> {
            const res = await apiFetch<{ data: Entry }>(`${basePath}/${id}/restore`, {
                method: 'POST',
            });
            return res.data;
        },

        async delete(id: string): Promise<void> {
            await apiFetch<void>(`${basePath}/${id}/force`, {
                method: 'DELETE',
            });
        },

        async emptyTrash(): Promise<void> {
            await apiFetch<void>(`${basePath}/trash`, {
                method: 'DELETE',
            });
        },

        async versions(id: string): Promise<EntryVersion[]> {
            const res = await apiFetch<{ data: EntryVersion[] }>(`${basePath}/${id}/versions`);
            return res.data;
        },

        async restoreVersion(id: string, versionId: string): Promise<Entry> {
            const res = await apiFetch<{ data: Entry }>(`${basePath}/${id}/versions/${versionId}/restore`, {
                method: 'POST',
            });
            return res.data;
        },

        async translations(id: string): Promise<TranslationInfo[]> {
            const res = await apiFetch<{ data: TranslationInfo[] }>(`${basePath}/${id}/translations`);
            return res.data;
        },

        async createTranslation(
            sourceId: string,
            locale: string,
            options?: { copyFields?: boolean }
        ): Promise<Entry> {
            const res = await apiFetch<{ data: Entry }>(`${basePath}/${sourceId}/translations`, {
                method: 'POST',
                body: { locale, ...options },
            });
            return res.data;
        },

        async getTranslation(sourceId: string, locale: string): Promise<Entry | null> {
            try {
                const res = await apiFetch<{ data: Entry }>(`${basePath}/${sourceId}/translations/${locale}`);
                return res.data;
            } catch (err) {
                if (err instanceof AstromechApiError && err.status === 404) return null;
                throw err;
            }
        },

        async publish(id: string): Promise<Entry> {
            const res = await apiFetch<{ data: Entry }>(`${basePath}/${id}/publish`, {
                method: 'POST',
            });
            return res.data;
        },

        async unpublish(id: string): Promise<Entry> {
            const res = await apiFetch<{ data: Entry }>(`${basePath}/${id}/unpublish`, {
                method: 'POST',
            });
            return res.data;
        },

        async schedule(id: string, publishAt: Date): Promise<Entry> {
            const res = await apiFetch<{ data: Entry }>(`${basePath}/${id}/schedule`, {
                method: 'POST',
                body: { publishAt: publishAt.toISOString() },
            });
            return res.data;
        },
    };
}

// ============================================================================
// Media API Implementation
// ============================================================================

const mediaApi: MediaApi = {
    async all(): Promise<Media[]> {
        const res = await apiFetch<{ data: Media[] }>('/media');
        return res.data;
    },

    async list(params?: MediaListParams): Promise<MediaListResult> {
        return apiFetch<MediaListResult>('/media/list', {
            params: {
                search: params?.search,
                type: params?.type,
                page: params?.page,
                perPage: params?.perPage,
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
    async all(): Promise<User[]> {
        const res = await apiFetch<{ data: User[] }>('/users');
        return res.data;
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
// Collections Proxy
// ============================================================================

const collectionsProxy = new Proxy(
    {},
    {
        get(_target, prop: string) {
            return createCollectionApi(prop);
        },
    }
) as TypedCollectionsProxy;

// ============================================================================
// Export Client
// ============================================================================

export const Astromech: AstromechClient = {
    collections: collectionsProxy,
    media: mediaApi,
    settings: settingsApi,
    users: usersApi,
    config: null as unknown as ResolvedConfig, // Placeholder, will be set in middleware
    configure({ baseUrl }: { baseUrl: string }): void {
        apiBase = baseUrl;
    },
};

export default Astromech;
