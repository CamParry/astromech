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

export type SortDirection = 'asc' | 'desc';

// Drizzle-style: { createdAt: 'desc' } or [{ status: 'asc' }, { createdAt: 'desc' }]
export type SortOption = Record<string, SortDirection>;

export type WhereFilters = Record<string, unknown>;

export type QueryOptions = {
    populate?: string[];
    locale?: string;
};

export type EntryQueryParams = {
    type?: string;
    search?: string;
    where?: WhereFilters;
    trashed?: boolean;
    page?: number;
    limit?: number | 'all';
    sort?: SortOption | SortOption[];
    populate?: string[];
    locale?: string;
};

export type QueryResult<T = Entry> = {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    } | null; // null when limit is 'all'
};

/** @deprecated Use QueryResult instead */
export type EntryQueryResult<T = Entry> = QueryResult<T>;

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
    query(params?: Omit<EntryQueryParams, 'type'>): Promise<QueryResult<Entry>>;
    get(id: string, options?: QueryOptions): Promise<Entry | null>;
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

export type EntriesApi = {
    query(params?: EntryQueryParams): Promise<QueryResult<Entry>>;
    get(id: string, options?: QueryOptions & { type?: string }): Promise<Entry | null>;
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

export type UserQueryParams = {
    search?: string;
    page?: number;
    limit?: number | 'all';
    sort?: SortOption | SortOption[];
};

export type MediaMimeTypeFilter = 'images' | 'videos' | 'documents' | 'other';

export type MediaQueryParams = {
    search?: string;
    where?: {
        mimeType?: MediaMimeTypeFilter;
    };
    page?: number;
    limit?: number | 'all';
    sort?: SortOption | SortOption[];
};

export type MediaApi = {
    query(params?: MediaQueryParams): Promise<QueryResult<Media>>;
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
    query(params?: UserQueryParams): Promise<QueryResult<User>>;
    get(id: string): Promise<User | null>;
    create(data: { email: string; name: string; fields?: JsonObject }): Promise<User>;
    update(
        id: string,
        data: Partial<{ email: string; name: string; fields?: JsonObject }>
    ): Promise<User>;
    delete(id: string): Promise<void>;
};
