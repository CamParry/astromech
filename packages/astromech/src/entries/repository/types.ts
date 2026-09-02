/**
 * Internal EntryRepository contract: the seam between the entries service
 * (`src/entries/service.ts`) and a persistence backend. Not exported from the
 * package root.
 */

import type { ContentRef, ContentRow, ContentRowId } from '@/content/repository/types';
import type { Db } from '@/database/types';
import type { Capability } from '@/entries/capabilities';
import type { EntryVersionRow } from '@/entries/tables';
import type { EntryStatus, JsonObject, SortOption, WhereFilters } from '@/types/index';

export type RepositoryDb = Db;

export type { Capability } from '@/entries/capabilities';

/** The id of a row in `entry_content`. Shared with every other resource. */
export type { ContentRowId } from '@/content/repository/types';

/**
 * How a caller names one locale of one entry. `id` is the entry id — the only
 * id that appears in a URL, a service call, a relation or a preview. A missing
 * `locale` means the repository's default content locale.
 */
export type EntryRef = ContentRef;

/**
 * Universal entry shape a repository returns: the shared content shape plus the
 * entry's own columns. Capability extras are present only when the repository
 * supports them; `type` is present on multi-type repositories.
 */
export type EntryRow = ContentRow & {
    type?: string;
    title?: string;
    slug?: string | null;
    deletedAt?: Date | null;
};

/**
 * A column-level write to a content row. Keys whose value is `undefined` are
 * left untouched on update (the codec drops them) — so callers may spread a
 * partial validated payload without filtering.
 */
export type EntryWrite = {
    fields?: JsonObject | undefined;
    title?: string | undefined;
    slug?: string | null | undefined;
    status?: EntryStatus | undefined;
    publishedAt?: Date | null | undefined;
    locale?: string | undefined;
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
     * columns (tableRepository); the entries-table repository ignores it (title search).
     */
    searchFields?: readonly string[] | undefined;
    where?: WhereFilters | undefined;
    sort?: SortOption | SortOption[] | undefined;
    page?: number | undefined;
    limit?: number | 'all' | undefined;
};

/**
 * Snapshot the entries service hands to the versions capability group. A
 * version snapshots one content row, so the sequence is per content row.
 */
export type NewEntryVersionSnapshot = {
    contentId: ContentRowId;
    version: number;
    title: string;
    slug: string | null;
    fields: JsonObject;
    createdBy: string | null;
};

/** The entry a stored preview-token hash belongs to, and when it lapses. */
export type PreviewTokenRecord = {
    id: string;
    expiresAt: Date | null;
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
     * Fetch one locale of one entry; filters trashed entries unless
     * `includeTrashed`. Null when the entry or that locale's content row is
     * absent — there is no fallback to another locale. The caller asserts the
     * row's `type` matches the type it asked for, though a repository may throw
     * the canonical mismatch error itself instead.
     */
    get(ref: EntryRef, opts?: { includeTrashed?: boolean }): Promise<R | null>;
    /**
     * Fetch the entry in any one locale — the default content locale when it has
     * a row, else whichever comes first. Resource-level operations read through
     * it, so it must admit trashed entries under `includeTrashed`. Optional: a
     * repository whose rows are single-locale is never asked.
     */
    anyLocale?(id: string, opts?: { includeTrashed?: boolean }): Promise<R | null>;
    /** Create an entry and its first content row. */
    create(data: EntryWrite & { type: string }): Promise<R>;
    /** Write one locale's content row, creating it when it does not exist. */
    update(ref: EntryRef, data: EntryWrite): Promise<R>;
    /** Hard-delete the entry; its content rows and versions cascade. */
    delete(id: string): Promise<void>;

    /**
     * Which of these ids this repository holds. Trashed and staged rows MUST
     * count as existing: the caller drops a reference on a miss, so a false
     * negative deletes author data. Optional — one that omits it is never asked.
     */
    existingIds?(ids: string[]): Promise<Set<string>>;

    /**
     * Compute the unique slug for a base slug under (type, locale), excluding an
     * entry. Lives on the repository because uniqueness is a persistence
     * concern; the entries service computes the *base* slug.
     */
    uniqueSlug(
        type: string,
        locale: string,
        baseSlug: string,
        excludeId?: string
    ): Promise<string>;

    /**
     * Present iff `supports` includes 'trash'. Resource-level: every locale.
     * `actor` is recorded as the entry's `updatedBy`; absent leaves it alone.
     */
    trash?: {
        trash(id: string, actor?: string | null): Promise<void>;
        restore(id: string, actor?: string | null): Promise<R>;
        emptyTrash(type: string): Promise<void>;
    };

    /** Present iff `supports` includes 'versioning'. Keyed on the content row. */
    versions?: {
        list(contentId: ContentRowId): Promise<EntryVersionRow[]>;
        get(versionId: string): Promise<EntryVersionRow | null>;
        create(snapshot: NewEntryVersionSnapshot): Promise<void>;
        latestNumber(contentId: ContentRowId): Promise<number>;
    };

    /** Present iff `supports` includes 'staging'. */
    staging?: {
        /** The staged change for one locale of an entry, or null. */
        getByCanonical(id: string, locale?: string): Promise<R | null>;
        /** Add a second content row for that locale, staged for the canonical. */
        create(ref: EntryRef, data: EntryWrite): Promise<R>;
        /** Write that locale's staged content row; it must already exist. */
        update(ref: EntryRef, data: EntryWrite): Promise<R>;
        /** Discard the staged content row for that locale. */
        delete(ref: EntryRef): Promise<void>;
    };

    /** Present iff `supports` includes 'translatable'. */
    translatable?: {
        /** The entry's other canonical locales, excluding `excludeLocale`. */
        siblings(id: string, excludeLocale?: string): Promise<R[]>;
        /** Merge `values` into each sibling's fields (non-translatable propagation). */
        propagateFields(
            id: string,
            excludeLocale: string,
            values: JsonObject
        ): Promise<void>;
    };

    /**
     * The entry's single cross-locale preview token, stored as a hash. Absent on
     * a repository whose rows live outside the `entries` table.
     */
    previewToken?: {
        set(id: string, hash: string, expiresAt: Date | null): Promise<void>;
        clear(id: string): Promise<void>;
        findByHash(hash: string): Promise<PreviewTokenRecord | null>;
    };
};
