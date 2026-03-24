/**
 * Astromech Client
 *
 * Fetch-based client for use in client-side JavaScript (React admin, etc.)
 * Import from 'astromech/client'
 */

import type {
    AstromechClient,
    CollectionApi,
    Entity,
    EntityStatus,
    EntityVersion,
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
        async all(options?: QueryOptions): Promise<Entity[]> {
            const sort = Array.isArray(options?.sort) ? options.sort[0] : options?.sort;
            return apiFetch<Entity[]>(basePath, {
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
        ): Promise<PaginationResult<Entity>> {
            const sort = Array.isArray(options?.sort) ? options.sort[0] : options?.sort;
            return apiFetch<PaginationResult<Entity>>(basePath, {
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

        async get(id: string, options?: QueryOptions): Promise<Entity | null> {
            const res = await apiFetch<{ data: Entity } | null>(`${basePath}/${id}`, {
                params: {
                    populate: options?.populate?.join(','),
                    locale: options?.locale,
                },
            });
            return res?.data ?? null;
        },

        async where(filters: WhereFilters, options?: QueryOptions): Promise<Entity[]> {
            return apiFetch<Entity[]>(`${basePath}/query`, {
                method: 'POST',
                body: { filters, options },
            });
        },

        async create(data: {
            title: string;
            slug?: string;
            fields?: JsonObject;
            status?: EntityStatus;
            publishAt?: Date | null;
        }): Promise<Entity> {
            const res = await apiFetch<{ data: Entity }>(basePath, {
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
                status: EntityStatus;
                publishAt: Date | null;
            }>
        ): Promise<Entity> {
            const res = await apiFetch<{ data: Entity }>(`${basePath}/${id}`, {
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

        async duplicate(id: string): Promise<Entity> {
            const res = await apiFetch<{ data: Entity }>(`${basePath}/${id}/duplicate`, {
                method: 'POST',
            });
            return res.data;
        },

        async trashed(options?: QueryOptions): Promise<Entity[]> {
            return apiFetch<Entity[]>(`${basePath}/trashed`, {
                params: {
                    locale: options?.locale,
                },
            });
        },

        async restore(id: string): Promise<Entity> {
            const res = await apiFetch<{ data: Entity }>(`${basePath}/${id}/restore`, {
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

        async versions(id: string): Promise<EntityVersion[]> {
            return apiFetch<EntityVersion[]>(`${basePath}/${id}/versions`);
        },

        async restoreVersion(id: string, versionId: string): Promise<Entity> {
            const res = await apiFetch<{ data: Entity }>(`${basePath}/${id}/versions/${versionId}/restore`, {
                method: 'POST',
            });
            return res.data;
        },

        async translations(id: string): Promise<TranslationInfo[]> {
            return apiFetch<TranslationInfo[]>(`${basePath}/${id}/translations`);
        },

        async translate(
            id: string,
            locale: string,
            data?: Partial<{ title: string; fields: JsonObject }>
        ): Promise<Entity> {
            const res = await apiFetch<{ data: Entity }>(`${basePath}/${id}/translations/${locale}`, {
                method: 'POST',
                body: data,
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
