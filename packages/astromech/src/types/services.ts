/**
 * Service contract types — the operations each domain offers (entries, globals,
 * media, users, content, notifications).
 *
 * Entry surface design:
 *  - Every entry method takes a single options object.
 *  - `type` is required on every method.
 *  - Bulk-capable methods accept `id: string | string[]`; single id → single
 *    return, array id → array return. Bulk is all-or-nothing transactional.
 */

import type {
    Entry,
    EntryVersion,
    Global,
    GlobalVersion,
    Media,
    MediaVersion,
    Notification,
    ResourceType,
    User,
    UserVersion,
} from './domain';
import type {
    EntryQueryParams,
    MediaQueryParams,
    QueryResult,
    UserQueryParams,
} from './query';
import type {
    createEntryPayloadSchema,
    duplicateOverridesSchema,
    updateEntryPayloadSchema,
} from '@/entries/schema';
import type { updateGlobalSchema } from '@/globals/schema';
import type { updateMediaSchema } from '@/media/schema';
import type { createUserSchema, updateUserSchema } from '@/users/schema';
import type { z } from 'zod';

/**
 * One reference in the relationships index pointing at a resource: a row of a
 * `usedBy` answer, which the delete check and the media "used by" panel read.
 */
export type Usage = {
    sourceId: string;
    /** Display name of the source; empty when it could not be loaded. */
    sourceTitle: string;
    /** What holds the reference. */
    sourceKind: ResourceType;
    /**
     * An entry source's type (qualified for a plugin type) or a global source's
     * key. Null for user and media sources.
     */
    sourceType: string | null;
    /** Schema path of the field holding the reference (`sections[].gallery`). */
    schemaPath: string;
    /** Instance path — deep-links to the exact item. Never pattern-matched. */
    instancePath: string;
    /** True when only the source's staged (pending-merge) change holds it. */
    sourceStaged: boolean;
};

/**
 * The row `create` writes: the update patch plus the locale the first content
 * row is written for. Read off the titleless schema, since one type is shared
 * by every entry type.
 *
 * `title` is required for titled types, runtime-enforced by the per-type schema
 * with an identical 422. It stays optional here because `titleField: false`
 * types omit it.
 */
export type EntryCreateData = z.input<typeof createEntryPayloadSchema>;

/** Caller input for `create`: the type, and the row to write. */
export type EntryCreateParams = {
    type: string;
    data: EntryCreateData;
};

/** Update payload fragment: the fields that can be modified after creation. */
export type EntryUpdateData = z.input<typeof updateEntryPayloadSchema>;

/**
 * The same patch once the method has parsed it: every coercion applied, so
 * `publishedAt` is a `Date` and not the ISO string a JSON caller may send. What
 * the internal writes and the entry update hooks are handed.
 */
export type ParsedEntryUpdateData = z.output<typeof updateEntryPayloadSchema>;

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
export type EntryDuplicateOverrides = z.input<typeof duplicateOverridesSchema>;

/**
 * The entries domain's service contract: unified, type-scoped, options-object.
 * The five methods that take one id or a list answer to match, and each ends
 * with a union signature for a caller holding either. `defineService` reads a
 * method's types off that last signature.
 */
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
    update(params: EntryUpdateParams): Promise<Entry | Entry[]>;

    duplicate(params: {
        type: string;
        id: string;
        overrides?: EntryDuplicateOverrides;
    }): Promise<Entry>;

    trash(params: { type: string; id: string | readonly string[] }): Promise<void>;

    restore(params: { type: string; id: string }): Promise<Entry>;
    restore(params: { type: string; id: readonly string[] }): Promise<Entry[]>;
    restore(params: {
        type: string;
        id: string | readonly string[];
    }): Promise<Entry | Entry[]>;

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
    publish(params: {
        type: string;
        id: string | readonly string[];
        locale?: string;
    }): Promise<Entry | Entry[]>;

    unpublish(params: { type: string; id: string; locale?: string }): Promise<Entry>;
    unpublish(params: {
        type: string;
        id: readonly string[];
        locale?: string;
    }): Promise<Entry[]>;
    unpublish(params: {
        type: string;
        id: string | readonly string[];
        locale?: string;
    }): Promise<Entry | Entry[]>;

    /** `publishedAt` is a `Date`, or the offset ISO string one is coerced from. */
    schedule(params: {
        type: string;
        id: string;
        publishedAt: Date | string;
        locale?: string;
    }): Promise<Entry>;
    schedule(params: {
        type: string;
        id: readonly string[];
        publishedAt: Date | string;
        locale?: string;
    }): Promise<Entry[]>;
    schedule(params: {
        type: string;
        id: string | readonly string[];
        publishedAt: Date | string;
        locale?: string;
    }): Promise<Entry | Entry[]>;

    /** Every reference to this entry, from any resource. */
    usedBy(params: { type: string; id: string }): Promise<Usage[]>;

    // Forward versioning (staged entries) — all act on one locale of the entry.
    // Require the `staging` capability (entries-table repository) on the type; the
    // service throws otherwise.

    /** Stage a change: copy this locale's content into a second, linked row.
     * Throws `StagedChangeExistsError` if one already exists. */
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
        /** A `Date`, or the offset ISO string one is coerced from. */
        expiresAt?: Date | string | null;
    }): Promise<{ token: string }>;
    /** Revoke the entry's preview token. */
    revokePreviewToken(params: { type: string; id: string }): Promise<void>;
};

/**
 * The patch one `globals.update` call writes: fields, where omitted ones keep
 * their value, and optionally the status and publish gate.
 */
export type GlobalUpdateData = z.input<typeof updateGlobalSchema>;

/** The same patch once the method has parsed it: what the global update hooks see. */
export type ParsedGlobalUpdateData = z.output<typeof updateGlobalSchema>;

/**
 * The globals domain's service contract. Every method takes one options object
 * with `key` first and an optional `locale`; a missing locale is the default
 * content locale. There is no `query`, `create` or `delete`: a global exists
 * because the config declares it. An undeclared key is `ResourceNotFoundError`
 * from every method, `get` included.
 */
export type GlobalsService = {
    /**
     * One locale of one global, or null when it has never been saved there.
     * No fallback to another locale. Without `full` this is the public read:
     * it answers null unless the row is published and its publish gate has
     * passed, and strips `private` fields. `staged: true` requires `full` and
     * reads the staged change instead of the canonical row.
     */
    get(params: {
        key: string;
        locale?: string;
        /** Request the full (admin) shape instead of the default public shape. */
        full?: boolean;
        /** Read the staged change rather than the canonical row. Needs `full`. */
        staged?: boolean;
    }): Promise<Global | null>;
    /**
     * Write one locale, creating the global's row and that locale's content row
     * on demand. Fields merge: an omitted field keeps its stored value, and an
     * array or container value replaces wholesale. A locale other than the
     * default on a non-translatable global is a `ResourceValidationError`; on a
     * translatable one the new locale inherits the shared (`translatable:
     * false`) fields from the default-locale row.
     */
    update(params: {
        key: string;
        locale?: string;
        /**
         * Write this locale's staged change rather than its canonical row. It
         * must already exist — `createStaged` makes it — and the write takes no
         * version and propagates no shared fields. Needs the `staging`
         * capability.
         */
        staged?: boolean;
        data: GlobalUpdateData;
    }): Promise<Global>;
    /**
     * Move this locale to `published`, stamping `publishedAt` when it has none.
     * Needs the `statuses` capability and an already-saved locale.
     */
    publish(params: { key: string; locale?: string }): Promise<Global>;
    /**
     * Move this locale back to `unpublished` and clear its publish gate. Needs
     * the `statuses` capability and an already-saved locale.
     */
    unpublish(params: { key: string; locale?: string }): Promise<Global>;
    /**
     * Schedule this locale to publish at `publishedAt`: a `Date`, or the offset
     * ISO string one is coerced from. Needs the `statuses` capability and an
     * already-saved locale.
     */
    schedule(params: {
        key: string;
        locale?: string;
        publishedAt: Date | string;
    }): Promise<Global>;
    /**
     * The saved versions of this locale, newest first. Needs the `versioning`
     * capability and an already-saved locale.
     */
    versions(params: { key: string; locale?: string }): Promise<GlobalVersion[]>;
    /**
     * Roll this locale back to one of its versions, snapshotting the state
     * being overwritten first. Needs the `versioning` capability.
     */
    restoreVersion(params: {
        key: string;
        locale?: string;
        versionId: string;
    }): Promise<Global>;
    /**
     * Stage a change: copy this locale's content into a second, linked row,
     * with `data.fields` patched over the copy. Needs the `staging` capability
     * and an already-saved locale; throws `StagedChangeExistsError` when one
     * already exists.
     */
    createStaged(params: {
        key: string;
        locale?: string;
        data?: Pick<GlobalUpdateData, 'fields'>;
    }): Promise<Global>;
    /** This locale's staged change, or null. Needs the `staging` capability. */
    getStaged(params: { key: string; locale?: string }): Promise<Global | null>;
    /**
     * Merge the staged change into the canonical row (snapshot, overwrite,
     * discard) and return the updated canonical. Content-only: the canonical's
     * status is untouched.
     */
    mergeStaged(params: { key: string; locale?: string }): Promise<Global>;
    /** Discard this locale's staged change (hard delete). */
    deleteStaged(params: { key: string; locale?: string }): Promise<void>;
};

/** What one `media.update` call may write. */
export type MediaUpdateData = z.input<typeof updateMediaSchema>;

/**
 * The media domain's service contract. A missing `locale` is the default content
 * locale; `query` and `get` fall back to it when the one asked for has no
 * content row, while `versions` and `restoreVersion` address a content row and
 * throw `ResourceNotFoundError` when there is none.
 */
export type MediaService = {
    query(params?: MediaQueryParams): Promise<QueryResult<Media>>;
    get(params: { id: string; locale?: string }): Promise<Media | null>;
    upload(params: { file: File }): Promise<Media>;
    replace(params: { id: string; file: File }): Promise<Media>;
    update(params: {
        id: string;
        locale?: string;
        data: MediaUpdateData;
    }): Promise<Media>;
    delete(params: { id: string }): Promise<void>;
    /** Every reference to this media item, from any resource. */
    usedBy(params: { id: string }): Promise<Usage[]>;
    versions(params: { id: string; locale?: string }): Promise<MediaVersion[]>;
    restoreVersion(params: {
        id: string;
        locale?: string;
        versionId: string;
    }): Promise<Media>;
};

/** The row `users.create` writes. `role` defaults to the least-privileged built-in. */
export type UserCreateData = z.input<typeof createUserSchema>;

/** What one `users.update` call may write. */
export type UserUpdateData = z.input<typeof updateUserSchema>;

/**
 * The users domain's service contract. A missing `locale` is the default content
 * locale; `query` and `get` fall back to it when the one asked for has no
 * content row, while `versions` and `restoreVersion` address a content row and
 * throw `ResourceNotFoundError` when there is none.
 */
export type UsersService = {
    query(params?: UserQueryParams): Promise<QueryResult<User>>;
    get(params: { id: string; locale?: string }): Promise<User | null>;
    create(params: { data: UserCreateData }): Promise<User>;
    update(params: { id: string; locale?: string; data: UserUpdateData }): Promise<User>;
    delete(params: { id: string }): Promise<void>;
    versions(params: { id: string; locale?: string }): Promise<UserVersion[]>;
    restoreVersion(params: {
        id: string;
        locale?: string;
        versionId: string;
    }): Promise<User>;
};

/**
 * The notifications API. No `userId` anywhere: every method acts on the caller's
 * own rows, and the subject comes from the context a method is bound to — a
 * client's session, or the signed-in user of the request a server call is made
 * in.
 */
export type NotificationsService = {
    list(): Promise<Notification[]>;
    count(): Promise<number>;
    dismiss(params: { id: string }): Promise<void>;
    dismissAll(): Promise<void>;
};
