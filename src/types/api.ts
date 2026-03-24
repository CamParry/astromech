/**
 * API client contract types — collection API, media, settings, users
 */

import type {
    Entity,
    EntityStatus,
    EntityVersion,
    JsonObject,
    JsonValue,
    Media,
    Setting,
    User,
} from './domain.js';

// ============================================================================
// Query Types
// ============================================================================

export type PaginationResult<T> = {
    data: T[];
    pagination: {
        page: number;
        perPage: number;
        total: number;
        totalPages: number;
    };
};

export type SortDirection = 'asc' | 'desc';

export type SortOption = {
    field: string;
    direction?: SortDirection;
};

export type QueryOptions = {
    populate?: string[];
    locale?: string;
    withTrashed?: boolean;
    sort?: SortOption | SortOption[];
    filters?: WhereFilters;
};

export type WhereFilters = Record<string, unknown>;

// ============================================================================
// Collection API
// ============================================================================

export type TranslationInfo = {
    locale: string;
    entityId: string;
    slug: string | null;
    status: EntityStatus;
};

export type CollectionApi = {
    all(options?: QueryOptions): Promise<Entity[]>;
    paginate(
        perPage: number,
        page: number,
        options?: QueryOptions
    ): Promise<PaginationResult<Entity>>;
    get(id: string, options?: QueryOptions): Promise<Entity | null>;
    where(filters: WhereFilters, options?: QueryOptions): Promise<Entity[]>;
    create(data: {
        title: string;
        slug?: string;
        fields?: JsonObject;
        status?: EntityStatus;
        publishAt?: Date | null;
    }): Promise<Entity>;
    update(
        id: string,
        data: Partial<{
            title: string;
            slug: string;
            fields: JsonObject;
            status: EntityStatus;
            publishAt: Date | null;
        }>
    ): Promise<Entity>;
    trash(id: string): Promise<void>;
    duplicate(id: string): Promise<Entity>;
    trashed(options?: QueryOptions): Promise<Entity[]>;
    restore(id: string): Promise<Entity>;
    delete(id: string): Promise<void>;
    emptyTrash(): Promise<void>;
    versions(id: string): Promise<EntityVersion[]>;
    restoreVersion(id: string, versionId: string): Promise<Entity>;
    translations(id: string): Promise<TranslationInfo[]>;
    translate(
        id: string,
        locale: string,
        data?: Partial<{ title: string; fields: JsonObject }>
    ): Promise<Entity>;
};

// ============================================================================
// Media, Settings, Users APIs
// ============================================================================

export type MediaListParams = {
    search?: string;
    type?: string;
    page?: number;
    perPage?: number;
};

export type MediaListResult = {
    items: Media[];
    total: number;
    page: number;
    perPage: number;
};

export type MediaApi = {
    all(): Promise<Media[]>;
    list(params?: MediaListParams): Promise<MediaListResult>;
    get(id: string): Promise<Media | null>;
    upload(file: File): Promise<Media>;
    update(
        id: string,
        data: Partial<{ alt: string; fields: JsonObject }>
    ): Promise<Media>;
    delete(id: string): Promise<void>;
};

export type SettingsApi = {
    all(): Promise<Setting[]>;
    get(key: string): Promise<JsonValue | null>;
    set(key: string, value: JsonValue): Promise<Setting>;
};

export type UsersApi = {
    all(): Promise<User[]>;
    get(id: string): Promise<User | null>;
    create(data: { email: string; name: string; fields?: JsonObject }): Promise<User>;
    update(
        id: string,
        data: Partial<{ email: string; name: string; fields?: JsonObject }>
    ): Promise<User>;
    delete(id: string): Promise<void>;
};
