/**
 * The entries service contract and its input types: what `app.entries` offers.
 * `service.ts` binds the definition that implements it.
 *
 * Entry surface design:
 *  - Every entry method takes a single options object.
 *  - `type` is required on every method.
 *  - Bulk-capable methods take `id` for one entry or `ids` for a list; `id`
 *    answers one entry, `ids` a list. Bulk is all-or-nothing transactional.
 */

import type {
    createEntryPayloadSchema,
    duplicateOverridesSchema,
    updateEntryPayloadSchema,
} from './schema';
import type { Entry, EntryVersion, Usage, VersionMetadata } from '@/types/domain';
import type { EntryQueryParams, QueryResult } from '@/types/query';
import type { z } from 'zod';

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
 * Which entries a bulk-capable method acts on: one `id`, or a list of `ids`.
 * Exactly one is given; the method's input schema refuses both or neither.
 */
export type EntryAddress = { id?: string; ids?: readonly string[] };

/**
 * Caller input for `update`: which entries, which locale, and the patch to
 * apply to each. A locale with no content row yet is created, so this is how a
 * translation is written.
 */
export type EntryUpdateParams = EntryAddress & {
    type: string;
    locale?: string;
    /** Write the entry's staged change for this locale rather than its canonical row. */
    staged?: boolean;
    data: EntryUpdateData;
};

/** Overrides accepted by `duplicate`; `locale` copies that locale alone. */
export type EntryDuplicateOverrides = z.input<typeof duplicateOverridesSchema>;

/**
 * The entries domain's service contract: unified, type-scoped, options-object.
 * The five methods that take `id` or `ids` answer one entry or a list to match,
 * and each ends with a signature taking either, for a caller holding a union.
 * `defineService` reads a method's types off that last signature.
 */
export type EntriesService = {
    query(
        params: EntryQueryParams & { type: string | readonly string[] }
    ): Promise<QueryResult<Entry>>;

    /** How many entries of each type `query` would list, keyed by type. */
    count(params: {
        type: string | readonly string[];
        locale?: string;
        /** Count in the full (admin) shape, every status, instead of the public one. */
        full?: boolean;
    }): Promise<Record<string, number>>;

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
    update(params: EntryUpdateParams & { ids: readonly string[] }): Promise<Entry[]>;
    update(params: EntryUpdateParams): Promise<Entry | Entry[]>;

    duplicate(params: {
        type: string;
        id: string;
        overrides?: EntryDuplicateOverrides;
    }): Promise<Entry>;

    trash(params: { type: string } & EntryAddress): Promise<void>;

    restore(params: { type: string; id: string }): Promise<Entry>;
    restore(params: { type: string; ids: readonly string[] }): Promise<Entry[]>;
    restore(params: { type: string } & EntryAddress): Promise<Entry | Entry[]>;

    delete(params: { type: string } & EntryAddress): Promise<void>;

    emptyTrash(params: { type: string }): Promise<void>;

    /** This locale's saved versions, newest first, as their metadata. */
    versions(params: {
        type: string;
        id: string;
        locale?: string;
    }): Promise<VersionMetadata[]>;
    /** One saved version of this locale, by its number, with its snapshot. */
    getVersion(params: {
        type: string;
        id: string;
        locale?: string;
        version: number;
    }): Promise<EntryVersion>;
    restoreVersion(params: {
        type: string;
        id: string;
        version: number;
        locale?: string;
    }): Promise<Entry>;

    publish(params: { type: string; id: string; locale?: string }): Promise<Entry>;
    publish(params: {
        type: string;
        ids: readonly string[];
        locale?: string;
    }): Promise<Entry[]>;
    publish(
        params: { type: string; locale?: string } & EntryAddress
    ): Promise<Entry | Entry[]>;

    unpublish(params: { type: string; id: string; locale?: string }): Promise<Entry>;
    unpublish(params: {
        type: string;
        ids: readonly string[];
        locale?: string;
    }): Promise<Entry[]>;
    unpublish(
        params: { type: string; locale?: string } & EntryAddress
    ): Promise<Entry | Entry[]>;

    /** `publishedAt` is a `Date`, or the offset ISO string one is coerced from. */
    schedule(params: {
        type: string;
        id: string;
        publishedAt: Date | string;
        locale?: string;
    }): Promise<Entry>;
    schedule(params: {
        type: string;
        ids: readonly string[];
        publishedAt: Date | string;
        locale?: string;
    }): Promise<Entry[]>;
    schedule(
        params: {
            type: string;
            publishedAt: Date | string;
            locale?: string;
        } & EntryAddress
    ): Promise<Entry | Entry[]>;

    /** Every reference to this entry, from any resource. */
    usedBy(params: { type: string; id: string }): Promise<Usage[]>;

    // Forward versioning (staged entries) — all act on one locale of the entry.
    // Require the `staging` capability on the type; the service throws otherwise.

    /** Stage a change: copy this locale's content into a second, linked row.
     * Throws `StagedChangeExistsError` if one already exists. */
    createStaged(params: { type: string; id: string; locale?: string }): Promise<Entry>;
    /**
     * This locale's staged change, or null. `diverged` is true when the
     * canonical was written after the staged change was made from it.
     */
    getStaged(params: {
        type: string;
        id: string;
        locale?: string;
    }): Promise<(Entry & { diverged: boolean }) | null>;
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
