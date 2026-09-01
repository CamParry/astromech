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
import type {
    EntryQueryParams,
    MediaQueryParams,
    QueryResult,
    UserQueryParams,
} from './query';

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
     * import `fields/`.
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

/**
 * The row `create` writes: the update patch plus the locale the first content
 * row is written for.
 *
 * `title` is required for titled types, runtime-enforced by the per-type schema
 * with an identical 422. It stays optional here because `titleField: false`
 * types omit it; Phase 3 typegen restores per-type static strictness.
 */
export type EntryCreateData = Partial<{
    title: string;
    slug: string;
    locale: string;
    fields: JsonObject;
    status: EntryStatus;
    publishedAt: Date | null;
}>;

/** Caller input for `create`: the type, and the row to write. */
export type EntryCreateParams = {
    type: string;
    data: EntryCreateData;
};

/** Update payload fragment — fields that can be modified after creation. */
export type EntryUpdateData = Partial<{
    title: string;
    slug: string;
    fields: JsonObject;
    status: EntryStatus;
    publishedAt: Date | null;
}>;

/**
 * Caller input for `update`: which entries, which locale, and the patch to
 * apply to each. A locale with no content row yet is created, so this is how a
 * translation is written.
 */
export type EntryUpdateParams = {
    type: string;
    id: string | readonly string[];
    locale?: string;
    /** Write the entry's staged change for this locale rather than its canonical row. */
    staged?: boolean;
    data: EntryUpdateData;
};

/** Overrides accepted by `duplicate`; `locale` copies that locale alone. */
export type EntryDuplicateOverrides = Partial<{
    title: string;
    slug: string;
    locale: string;
    fields: JsonObject;
    status: EntryStatus;
}>;

/** The entries domain's service contract — unified, type-scoped, options-object. */
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

    create(params: EntryCreateParams): Promise<Entry>;

    update(params: EntryUpdateParams & { id: string }): Promise<Entry>;
    update(params: EntryUpdateParams & { id: readonly string[] }): Promise<Entry[]>;

    duplicate(params: {
        type: string;
        id: string;
        overrides?: EntryDuplicateOverrides;
    }): Promise<Entry>;

    trash(params: { type: string; id: string | readonly string[] }): Promise<void>;

    restore(params: { type: string; id: string }): Promise<Entry>;
    restore(params: { type: string; id: readonly string[] }): Promise<Entry[]>;

    delete(params: { type: string; id: string | readonly string[] }): Promise<void>;

    emptyTrash(params: { type: string }): Promise<void>;

    versions(params: {
        type: string;
        id: string;
        locale?: string;
    }): Promise<EntryVersion[]>;
    restoreVersion(params: {
        type: string;
        id: string;
        versionId: string;
        locale?: string;
    }): Promise<Entry>;

    publish(params: { type: string; id: string; locale?: string }): Promise<Entry>;
    publish(params: {
        type: string;
        id: readonly string[];
        locale?: string;
    }): Promise<Entry[]>;

    unpublish(params: { type: string; id: string; locale?: string }): Promise<Entry>;
    unpublish(params: {
        type: string;
        id: readonly string[];
        locale?: string;
    }): Promise<Entry[]>;

    schedule(params: {
        type: string;
        id: string;
        publishedAt: Date;
        locale?: string;
    }): Promise<Entry>;
    schedule(params: {
        type: string;
        id: readonly string[];
        publishedAt: Date;
        locale?: string;
    }): Promise<Entry[]>;

    incomingRelationships(params: {
        type: string;
        id: string;
    }): Promise<IncomingRelationship[]>;

    // Forward versioning (staged entries) — all act on one locale of the entry.
    // Require the `staging` capability (entries-table repository) on the type; the
    // service throws otherwise.

    /** Stage a change: copy this locale's content into a second, linked row.
     * Throws `StagedEntryExistsError` if one already exists. */
    createStaged(params: { type: string; id: string; locale?: string }): Promise<Entry>;
    /** This locale's staged change, or null. */
    getStaged(params: {
        type: string;
        id: string;
        locale?: string;
    }): Promise<Entry | null>;
    /** Merge the staged change into the canonical row (backup → update → cleanup);
     * returns the updated canonical. Content-only — does not change status. */
    mergeStaged(params: { type: string; id: string; locale?: string }): Promise<Entry>;
    /** Discard this locale's staged change (hard delete). */
    deleteStaged(params: { type: string; id: string; locale?: string }): Promise<void>;
    /**
     * Issue the entry's preview token (replacing any existing one), authorizing
     * every locale of it. The plaintext is returned once; only its hash is stored.
     */
    issuePreviewToken(params: {
        type: string;
        id: string;
        expiresAt?: Date | null;
    }): Promise<{ token: string }>;
    /** Revoke the entry's preview token. */
    revokePreviewToken(params: { type: string; id: string }): Promise<void>;
};

/** The media domain's service contract. */
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

/** The settings domain's service contract. */
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

/** The row `users.create` writes. */
export type UserCreateData = {
    email: string;
    name: string;
    fields?: JsonObject;
    roleSlug?: string;
};

/** The users domain's service contract. */
export type UsersService = {
    query(params?: UserQueryParams): Promise<QueryResult<User>>;
    get(params: { id: string }): Promise<User | null>;
    create(params: { data: UserCreateData }): Promise<User>;
    update(params: {
        id: string;
        data: Partial<{
            email: string;
            name: string;
            fields?: JsonObject;
            roleSlug: string;
        }>;
    }): Promise<User>;
    delete(params: { id: string }): Promise<void>;
};

/**
 * The CLIENT's notifications API. No `userId` anywhere: every method acts on the
 * caller's own rows and each transport fills the subject from the session. The
 * server-side shape names it — `NotificationsDomainService` in
 * `notifications/service.ts` — so the two are deliberately different types.
 */
export type NotificationsService = {
    list(): Promise<Notification[]>;
    count(): Promise<number>;
    dismiss(params: { id: string }): Promise<void>;
    dismissAll(): Promise<void>;
};
