/**
 * API client contract types — collection API, media, settings, users
 */

import type {
    Entry,
    EntryStatus,
    EntryVersion,
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
// Entry Type API
// ============================================================================

export type TranslationInfo = {
    locale: string;
    entryId: string;
    slug: string | null;
    status: EntryStatus;
};

export type EntryTypeApi = {
    all(options?: QueryOptions): Promise<Entry[]>;
    paginate(
        perPage: number,
        page: number,
        options?: QueryOptions
    ): Promise<PaginationResult<Entry>>;
    get(id: string, options?: QueryOptions): Promise<Entry | null>;
    where(filters: WhereFilters, options?: QueryOptions): Promise<Entry[]>;
    create(data: {
        title: string;
        slug?: string;
        fields?: JsonObject;
        status?: EntryStatus;
        publishAt?: Date | null;
    }): Promise<Entry>;
    update(
        id: string,
        data: Partial<{
            title: string;
            slug: string;
            fields: JsonObject;
            status: EntryStatus;
            publishAt: Date | null;
        }>
    ): Promise<Entry>;
    trash(id: string): Promise<void>;
    duplicate(id: string): Promise<Entry>;
    trashed(options?: QueryOptions): Promise<Entry[]>;
    restore(id: string): Promise<Entry>;
    delete(id: string): Promise<void>;
    emptyTrash(): Promise<void>;
    versions(id: string): Promise<EntryVersion[]>;
    restoreVersion(id: string, versionId: string): Promise<Entry>;
    translations(id: string): Promise<TranslationInfo[]>;
    createTranslation(
        sourceId: string,
        locale: string,
        options?: { copyFields?: boolean }
    ): Promise<Entry>;
    getTranslation(sourceId: string, locale: string): Promise<Entry | null>;
    publish(id: string): Promise<Entry>;
    unpublish(id: string): Promise<Entry>;
    schedule(id: string, publishAt: Date): Promise<Entry>;
};

// ============================================================================
// Entries API (unified, type-discriminated)
// ============================================================================

export type EntriesQueryOptions = QueryOptions & { type?: string };

export type EntriesApi = {
    all(options?: EntriesQueryOptions): Promise<Entry[]>;
    paginate(
        perPage: number,
        page: number,
        options?: EntriesQueryOptions
    ): Promise<PaginationResult<Entry>>;
    get(id: string, options?: EntriesQueryOptions): Promise<Entry | null>;
    where(filters: WhereFilters, options?: EntriesQueryOptions): Promise<Entry[]>;
    create(data: {
        type: string;
        title: string;
        slug?: string;
        fields?: JsonObject;
        status?: EntryStatus;
        publishAt?: Date | null;
    }): Promise<Entry>;
    update(
        id: string,
        data: Partial<{
            title: string;
            slug: string;
            fields: JsonObject;
            status: EntryStatus;
            publishAt: Date | null;
        }>
    ): Promise<Entry>;
    trash(id: string): Promise<void>;
    duplicate(id: string): Promise<Entry>;
    trashed(options?: EntriesQueryOptions): Promise<Entry[]>;
    restore(id: string): Promise<Entry>;
    delete(id: string): Promise<void>;
    emptyTrash(options?: { type?: string }): Promise<void>;
    versions(id: string): Promise<EntryVersion[]>;
    restoreVersion(id: string, versionId: string): Promise<Entry>;
    translations(id: string): Promise<TranslationInfo[]>;
    createTranslation(
        sourceId: string,
        locale: string,
        options?: { copyFields?: boolean }
    ): Promise<Entry>;
    getTranslation(sourceId: string, locale: string): Promise<Entry | null>;
    publish(id: string): Promise<Entry>;
    unpublish(id: string): Promise<Entry>;
    schedule(id: string, publishAt: Date): Promise<Entry>;
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
