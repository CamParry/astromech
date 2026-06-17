/**
 * Internal EntryStorage contract.
 *
 * This is NOT exported from the package root — it is the seam between the
 * entry orchestrator (`src/sdk/local/entries.ts`: validation, hooks,
 * relationships, versioning policy, bulk) and a persistence backend. The
 * built-in storage (`built-in.ts`) is the only Phase 2 implementation; Phase 3
 * mounts a single-table storage that declares no capabilities and so only needs
 * the five base methods.
 *
 * Shape: five base methods (list/get/create/update/delete), an optional
 * `transaction`, and three optional capability sub-surfaces (trash/versions/
 * translatable) required iff the corresponding capability is declared in
 * `supports`. `statuses`/`slug` carry no methods — they gate which EntryWrite
 * keys / ListParams the orchestrator passes.
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { Capability } from './capabilities.js';
import type {
    EntryStatus,
    EntryVersion,
    JsonObject,
    SortOption,
    WhereFilters,
} from '@/types/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StorageDb = LibSQLDatabase<any>;

export type { Capability } from './capabilities.js';

/**
 * Universal entry shape a storage returns. The built-in storage returns full
 * `Entry` rows (which structurally satisfy this). Capability extras are present
 * only when the storage supports them; `type` is present on multi-type storages
 * (the orchestrator asserts on it). The `locales` map is populated by storages
 * supporting `translatable`.
 */
export type EntryRecord = {
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
     * Fields to apply `search` over; honored by storages that map fields to
     * columns (tableStorage); built-in storage ignores it (title search).
     */
    searchFields?: readonly string[] | undefined;
    where?: WhereFilters | undefined;
    sort?: SortOption | SortOption[] | undefined;
    page?: number | undefined;
    limit?: number | 'all' | undefined;
};

/**
 * Snapshot the orchestrator hands to the versions sub-surface. Derived from
 * `EntryVersion` minus storage-managed columns (id/createdAt/versionNumber are
 * the storage's concern via `latestNumber`).
 */
export type NewEntryVersionSnapshot = {
    entryId: string;
    versionNumber: number;
    title: string;
    slug: string | null;
    fields: JsonObject;
    relations: Record<string, string | string[]>;
    createdBy: string | null;
};

/**
 * Capability gate: the orchestrator asserts a record's `type` matches the
 * expected type. Stored here as a shared shape so storages can throw the
 * canonical mismatch error if they prefer (the built-in defers to the
 * orchestrator).
 */
export type EntryStorage<R extends EntryRecord = EntryRecord> = {
    readonly supports: readonly Capability[];

    list(params: ListParams): Promise<{ data: R[]; total: number }>;
    /** Fetch a single record; filters trashed rows unless `includeTrashed`. */
    get(id: string, opts?: { includeTrashed?: boolean }): Promise<R | null>;
    create(data: EntryWrite & { type: string }): Promise<R>;
    update(id: string, data: EntryWrite): Promise<R>;
    delete(id: string, opts?: { cascadeLocales?: boolean }): Promise<void>;

    /**
     * Run `fn` inside a single transaction. The storage handed to `fn` is bound
     * to the tx; the raw tx db handle is also provided so the orchestrator can
     * keep core relationship persistence (which lives outside the storage
     * contract) atomic with the storage writes.
     */
    transaction?<T>(
        fn: (storage: EntryStorage<R>, db: StorageDb) => Promise<T>
    ): Promise<T>;

    /**
     * Compute the unique slug for a base slug under (type, locale), excluding an
     * id. Lives on the storage because uniqueness is a persistence concern; the
     * orchestrator computes the *base* slug (title-derived or explicit).
     */
    uniqueSlug(
        type: string,
        locale: string,
        baseSlug: string,
        excludeId?: string
    ): Promise<string>;

    /** Present iff `supports` includes 'trash'. */
    trash?: {
        trash(id: string, opts?: { cascadeLocales?: boolean }): Promise<void>;
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
