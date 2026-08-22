/**
 * Internal EntryRepository contract: the seam between the entries service
 * (`src/entries/service.ts`) and a persistence backend. Not exported from the
 * package root.
 */

import type { Db } from '@/database/types';
import type { Capability } from '@/entries/capabilities';
import type {
    EntryStatus,
    EntryVersion,
    JsonObject,
    SortOption,
    WhereFilters,
} from '@/types/index';

export type RepositoryDb = Db;

export type { Capability } from '@/entries/capabilities';

/**
 * Universal entry shape a repository returns. Capability extras are present only
 * when the repository supports them; `type` is present on multi-type
 * repositories, and `locales` on those supporting `translatable`.
 */
export type EntryRow = {
    id: string;
    fields: JsonObject;
    createdAt: Date;
    updatedAt: Date;
    createdBy?: string | null;
    updatedBy?: string | null;
    type?: string;
    title?: string;
    slug?: string | null;
    status?: EntryStatus;
    stagedFor?: string | null;
    publishedAt?: Date | null;
    deletedAt?: Date | null;
    locale?: string;
    localeGroup?: string;
    locales?: Record<string, string>;
};

/**
 * A column-level write to an entry row. Keys whose value is `undefined` are left
 * untouched on update (drizzle `.set()` skips them) — so callers may spread a
 * partial validated payload without filtering.
 */
export type EntryWrite = {
    fields?: JsonObject | undefined;
    title?: string | undefined;
    slug?: string | null | undefined;
    status?: EntryStatus | undefined;
    /** Non-null marks the row as a staged change of the referenced canonical. */
    stagedFor?: string | null | undefined;
    publishedAt?: Date | null | undefined;
    locale?: string | undefined;
    localeGroup?: string | undefined;
    createdBy?: string | null | undefined;
    updatedBy?: string | null | undefined;
};

export type ListParams = {
    type: string | readonly string[];
    locale?: string | 'all' | undefined;
    trashed?: boolean | undefined;
    search?: string | undefined;
    /**
     * Fields to apply `search` over; honored by repositories that map fields to
     * columns (tableRepository); the built-in repository ignores it (title search).
     */
    searchFields?: readonly string[] | undefined;
    where?: WhereFilters | undefined;
    sort?: SortOption | SortOption[] | undefined;
    page?: number | undefined;
    limit?: number | 'all' | undefined;
};

/**
 * Snapshot the entries service hands to the versions capability group. Derived from
 * `EntryVersion` minus repository-managed columns (id/createdAt/versionNumber are
 * the repository's concern via `latestNumber`).
 */
export type NewEntryVersionSnapshot = {
    entryId: string;
    versionNumber: number;
    title: string;
    slug: string | null;
    fields: JsonObject;
    createdBy: string | null;
};

/**
 * What a persistence backend exposes to the entries service: five base methods
 * (list/get/create/update/delete) plus one group per capability it declares in
 * `supports`. `statuses` and `slug` carry no methods of their own.
 */
export type EntryRepository<R extends EntryRow = EntryRow> = {
    readonly supports: readonly Capability[];

    list(params: ListParams): Promise<{ data: R[]; total: number }>;
    /**
     * Fetch a single row; filters trashed rows unless `includeTrashed`. The
     * caller asserts the row's `type` matches the type it asked for, though a
     * repository may throw the canonical mismatch error itself instead.
     */
    get(id: string, opts?: { includeTrashed?: boolean }): Promise<R | null>;
    create(data: EntryWrite & { type: string }): Promise<R>;
    update(id: string, data: EntryWrite): Promise<R>;
    delete(id: string): Promise<void>;

    /**
     * Which of these ids this repository holds. Trashed and staged rows MUST
     * count as existing: the caller drops a reference on a miss, so a false
     * negative deletes author data. Optional — one that omits it is never asked.
     */
    existingIds?(ids: string[]): Promise<Set<string>>;

    /**
     * Compute the unique slug for a base slug under (type, locale), excluding an
     * id. Lives on the repository because uniqueness is a persistence concern; the
     * entries service computes the *base* slug (title-derived or explicit).
     */
    uniqueSlug(
        type: string,
        locale: string,
        baseSlug: string,
        excludeId?: string
    ): Promise<string>;

    /** Present iff `supports` includes 'trash'. */
    trash?: {
        trash(id: string): Promise<void>;
        restore(id: string): Promise<R>;
        emptyTrash(type: string): Promise<void>;
    };

    /** Present iff `supports` includes 'versioning'. */
    versions?: {
        list(entryId: string): Promise<EntryVersion[]>;
        get(versionId: string): Promise<EntryVersion | null>;
        create(snapshot: NewEntryVersionSnapshot): Promise<void>;
        latestNumber(entryId: string): Promise<number>;
    };

    /** Present iff `supports` includes 'staging'. */
    staging?: {
        /** The staged change for a canonical entry, or null (live rows only). */
        getByCanonical(canonicalId: string): Promise<R | null>;
    };

    /** Present iff `supports` includes 'translatable'. */
    translatable?: {
        /** Sibling rows sharing a locale group (excluding `excludeId`), live rows only. */
        siblings(localeGroup: string, excludeId?: string): Promise<R[]>;
        /** Merge `values` into each sibling's fields (non-translatable propagation). */
        propagateFields(
            localeGroup: string,
            excludeId: string,
            values: JsonObject
        ): Promise<void>;
    };
};
