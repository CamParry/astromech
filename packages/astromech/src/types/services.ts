/**
 * Service contract types — the operations each domain offers (entries, media,
 * settings, users, content, notifications).
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
} from './domain';

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

/**
 * `where: { references: { path, id } }` — sources holding a relationship to
 * `id` at schema path `path` (`author`, `sections[].gallery`). Id-only: the
 * path is checked against the queried types' schemas and throws when unknown.
 */
export type ReferencesFilter = {
    path: string;
    id: string;
};

/**
 * Flat `where` DSL. Left open because callers pass column filters of every
 * shape; the one non-column key is `references`, a {@link ReferencesFilter}.
 */
export type WhereFilters = Record<string, unknown>;

export type QueryOptions = {
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
    /** Locale code, or `'all'` for rows across every locale. Defaults to configured `defaultLocale`. */
    locale?: string | AllLocales;
    /** Request the full (admin) shape instead of the default public shape. */
    full?: boolean;
    /**
     * Preview token (forward versioning). When valid for the matched canonical
     * entry, the publish/schedule gate is bypassed for it (public shape only),
     * so an unpublished/scheduled entry — or its staged change — is returned.
     * Invalid/absent → normal public behaviour (non-published → nothing).
     */
    previewToken?: string;
    /** With a valid `previewToken`, preview the staged change instead of the current entry. */
    staged?: boolean;
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
export type IncomingRelationship = {
    /** Source entry id (the entry that contains the relationship). */
    sourceId: string;
    /** Title of the source entry. */
    sourceTitle: string;
    /** Type of the source entry (only `'entry'`-source rows are returned). */
    sourceType: string;
    /** Schema path of the relationship field on the source (`sections[].author`). */
    schemaPath: string;
};

/**
 * One relationships-index edge pointing at a media item — a row of the media
 * "used by" panel. The media mirror of {@link IncomingRelationship}, widened to
 * carry the source kind because a media file can be referenced by an entry, a
 * user or another media record.
 */
export type MediaUsage = {
    sourceId: string;
    /** Display name of the source; empty when it could not be loaded. */
    sourceTitle: string;
    /**
     * entry | user | media — what holds the reference. Duplicated from
     * `fields/relationship-edges.ts`'s `TargetKind` because a pure leaf may not
     * import a capability.
     */
    sourceKind: 'entry' | 'user' | 'media';
    /** The source's entry type, qualified for a plugin type. Null for user and media sources. */
    sourceType: string | null;
    /** Schema path of the field holding the reference (`sections[].gallery`). */
    schemaPath: string;
    /** Instance path — deep-links to the exact item. Never pattern-matched. */
    instancePath: string;
    /** True when the source is a staged (pending-merge) copy. */
    sourceStaged: boolean;
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

export type EntriesService = {
    query(
        params: EntryQueryParams & { type: string | readonly string[] }
    ): Promise<QueryResult<Entry>>;

    get(params: {
        type: string;
        id: string;
        locale?: string;
        /** Request the full (admin) shape instead of the default public shape. */
        full?: boolean;
        /** Preview token — see EntryQueryParams.previewToken (public shape only). */
        previewToken?: string;
        /** With a valid `previewToken`, preview the staged change instead. */
        staged?: boolean;
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
        /** Existing localeGroup to join. Omit for a fresh group (ULID generated). */
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

    incomingRelationships(params: {
        type: string;
        id: string;
    }): Promise<IncomingRelationship[]>;

    // ── Forward versioning (staged entries) ────────────────────────────────
    // All take the *canonical* entry id. Require the `staging` capability
    // (built-in storage) on the type; the service throws otherwise.

    /** Stage a change: copy the canonical's content into a new linked row.
     * Throws `StagedEntryExistsError` if one already exists. */
    createStaged(params: { type: string; id: string }): Promise<Entry>;
    /** The canonical entry's staged change, or null. */
    getStaged(params: { type: string; id: string }): Promise<Entry | null>;
    /** Merge the staged change into the canonical (backup → update → cleanup);
     * returns the updated canonical. Content-only — does not change status. */
    mergeStaged(params: { type: string; id: string }): Promise<Entry>;
    /** Discard the canonical's staged change (hard delete). */
    deleteStaged(params: { type: string; id: string }): Promise<void>;
    /**
     * Issue a preview token for a canonical entry (replaces any existing one).
     * The plaintext token is returned once; only its hash is stored.
     */
    issuePreviewToken(params: {
        type: string;
        id: string;
        expiresAt?: Date | null;
    }): Promise<{ token: string }>;
    /** Revoke the canonical entry's preview token(s). */
    revokePreviewToken(params: { type: string; id: string }): Promise<void>;
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

export type MediaService = {
    query(params?: MediaQueryParams): Promise<QueryResult<Media>>;
    get(params: { id: string }): Promise<Media | null>;
    upload(params: { file: File }): Promise<Media>;
    replace(params: { id: string; file: File }): Promise<Media>;
    update(params: {
        id: string;
        data: Partial<{
            alt: string;
            title: string;
            caption: string;
            fields: JsonObject;
        }>;
    }): Promise<Media>;
    delete(params: { id: string }): Promise<void>;
    usedBy(params: { id: string }): Promise<MediaUsage[]>;
};

export type SettingsService = {
    /**
     * Return all settings. Without `full: true` only public-marked keys are
     * returned (private keys are omitted). Pass `{ full: true }` from a trusted
     * (server-side / authenticated) context to receive all keys.
     */
    all(params?: { full?: boolean }): Promise<Setting[]>;
    /**
     * Return a single setting value. Without `full: true` only public-marked
     * keys resolve; a non-public key returns `null` on a public read.
     */
    get(params: {
        key: string;
        locale?: string;
        full?: boolean;
    }): Promise<JsonValue | null>;
    set(params: { key: string; value: JsonValue }): Promise<Setting>;
};

export type UsersService = {
    query(params?: UserQueryParams): Promise<QueryResult<User>>;
    get(params: { id: string }): Promise<User | null>;
    create(params: { email: string; name: string; fields?: JsonObject }): Promise<User>;
    update(params: {
        id: string;
        data: Partial<{ email: string; name: string; fields?: JsonObject }>;
    }): Promise<User>;
    delete(params: { id: string }): Promise<void>;
};

// ============================================================================
// Notifications API (session-scoped)
// ============================================================================

export type NotificationsService = {
    list(): Promise<Notification[]>;
    count(): Promise<number>;
    dismiss(params: { id: string }): Promise<void>;
    dismissAll(): Promise<void>;
};
