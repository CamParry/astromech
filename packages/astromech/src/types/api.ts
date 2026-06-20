/**
 * API client contract types — entries API, media, settings, users.
 *
 * Entry surface design:
 *  - Every entry method takes a single options object.
 *  - `type` is required on every method.
 *  - Bulk-capable methods accept `id: string | string[]`; single id → single
 *    return, array id → array return. Bulk is all-or-nothing transactional.
 */

import type {
    Entry,
    EntryStatus,
    EntryVersion,
    JsonObject,
    JsonValue,
    Media,
    Notification,
    Setting,
    User,
} from './domain.js';

// ============================================================================
// Locale Sentinels
// ============================================================================

/** Sentinel for query({ locale }) meaning "rows across all locales". */
export type AllLocales = 'all';

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
    /** Single type or array of types. Required at the runtime surface. */
    type?: string | readonly string[];
    search?: string;
    where?: WhereFilters;
    trashed?: boolean;
    page?: number;
    limit?: number | 'all';
    sort?: SortOption | SortOption[];
    populate?: string[];
    /** Locale code, or `'all'` for rows across every locale. Defaults to configured `defaultLocale`. */
    locale?: string | AllLocales;
    /** Request the full (admin) shape instead of the default public shape. */
    full?: boolean;
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
// Entry options
// ============================================================================

/**
 * Lightweight summary of an inbound relationship row — used by the delete
 * confirmation modal to surface entries that reference the one being deleted.
 */
export type IncomingRelation = {
    /** Source entry id (the entry that contains the relationship). */
    sourceId: string;
    /** Title of the source entry. */
    sourceTitle: string;
    /** Type of the source entry (only `'entry'`-source rows are returned). */
    sourceType: string;
    /** Relationship field name on the source entry. */
    name: string;
};

/** Update payload fragment — fields that can be modified after creation. */
export type EntryUpdateData = Partial<{
    title: string;
    slug: string;
    fields: JsonObject;
    status: EntryStatus;
    publishAt: Date | null;
}>;

/** Overrides accepted by `duplicate` — superset of update plus locale fields. */
export type EntryDuplicateOverrides = Partial<{
    title: string;
    slug: string;
    locale: string;
    localeGroup: string;
    fields: JsonObject;
    status: EntryStatus;
}>;

// ============================================================================
// Entries API (unified, type-scoped, options-object)
// ============================================================================

export type EntriesApi = {
    query(
        params: EntryQueryParams & { type: string | readonly string[] }
    ): Promise<QueryResult<Entry>>;

    get(params: {
        type: string;
        id: string;
        locale?: string;
        populate?: string[];
        /** Request the full (admin) shape instead of the default public shape. */
        full?: boolean;
    }): Promise<Entry | null>;

    create(params: {
        type: string;
        /**
         * Required for titled types (runtime-enforced by the per-type schema,
         * identical 422). Optional for `titleField: false` types; Phase 3 typegen
         * restores per-type static strictness.
         */
        title?: string;
        slug?: string;
        locale?: string;
        /** Existing localeGroup to join. Omit for a fresh group (UUID generated). */
        localeGroup?: string;
        fields?: JsonObject;
        status?: EntryStatus;
        publishAt?: Date | null;
    }): Promise<Entry>;

    update(params: { type: string; id: string; data: EntryUpdateData }): Promise<Entry>;
    update(params: {
        type: string;
        id: readonly string[];
        data: EntryUpdateData;
    }): Promise<Entry[]>;

    duplicate(params: {
        type: string;
        id: string;
        overrides?: EntryDuplicateOverrides;
    }): Promise<Entry>;

    trash(params: {
        type: string;
        id: string | readonly string[];
        cascadeLocales?: boolean;
    }): Promise<void>;

    restore(params: { type: string; id: string }): Promise<Entry>;
    restore(params: { type: string; id: readonly string[] }): Promise<Entry[]>;

    delete(params: {
        type: string;
        id: string | readonly string[];
        cascadeLocales?: boolean;
    }): Promise<void>;

    emptyTrash(params: { type: string }): Promise<void>;

    versions(params: { type: string; id: string }): Promise<EntryVersion[]>;
    restoreVersion(params: {
        type: string;
        id: string;
        versionId: string;
    }): Promise<Entry>;

    publish(params: { type: string; id: string }): Promise<Entry>;
    publish(params: { type: string; id: readonly string[] }): Promise<Entry[]>;

    unpublish(params: { type: string; id: string }): Promise<Entry>;
    unpublish(params: { type: string; id: readonly string[] }): Promise<Entry[]>;

    schedule(params: { type: string; id: string; publishAt: Date }): Promise<Entry>;
    schedule(params: {
        type: string;
        id: readonly string[];
        publishAt: Date;
    }): Promise<Entry[]>;

    incomingRelations(params: { type: string; id: string }): Promise<IncomingRelation[]>;
};

/**
 * Forward-versioning (staged entries) operations. Kept separate from `EntriesApi`
 * until the transport/manifest/client wiring lands (WS4); the in-process service
 * object is typed as `EntriesApi & EntriesStagingApi`. All methods take the
 * *canonical* entry id.
 */
export type EntriesStagingApi = {
    /** Stage a change: copy the canonical's content + relations into a new linked
     * row. Throws `StagedEntryExistsError` if one already exists. */
    createStaged(params: { type: string; id: string }): Promise<Entry>;
    /** The canonical entry's staged change, or null. */
    getStaged(params: { type: string; id: string }): Promise<Entry | null>;
    /** Merge the staged change into the canonical (backup → update → cleanup) and
     * publish it; returns the updated canonical. */
    mergeStaged(params: { type: string; id: string }): Promise<Entry>;
    /** Discard the canonical's staged change (hard delete). */
    deleteStaged(params: { type: string; id: string }): Promise<void>;
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
    /**
     * Return all settings. Without `full: true` only public-marked keys are
     * returned (private keys are omitted). Pass `{ full: true }` from a trusted
     * (server-side / authenticated) context to receive all keys.
     */
    all(opts?: { full?: boolean }): Promise<Setting[]>;
    /**
     * Return a single setting value. Without `full: true` only public-marked
     * keys resolve; a non-public key returns `null` on a public read.
     */
    get(
        key: string,
        opts?: { locale?: string; full?: boolean }
    ): Promise<JsonValue | null>;
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

// ============================================================================
// Notifications API (session-scoped)
// ============================================================================

export type NotificationsApi = {
    list(): Promise<Notification[]>;
    count(): Promise<number>;
    dismiss(id: string): Promise<void>;
    dismissAll(): Promise<void>;
};
