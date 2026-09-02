/**
 * The shared content repository contract. `content/` is the persistence half
 * every resource with per-locale authored values shares — a resource row, a
 * content row per locale, and versions of a content row. `entries/` and
 * `globals/` compose their own repositories over it and keep their own columns,
 * filters and queries to themselves.
 *
 * It imports `database/`, `fields/`, `utilities/` and `types/` and nothing
 * above them.
 */

import type { Table, TableSelect } from '@/database/define-table';
import type { GenericDb } from '@/database/repository/create-repository';
import type { Db } from '@/database/types';
import type { EntryStatus, JsonObject } from '@/types/index';
import type { Expression, ExpressionBuilder, SqlBool } from 'kysely';

/**
 * The three tables one resource persists through, plus how they join. Data, not
 * generics: the repository reaches every table through this object, so one
 * implementation serves every resource.
 */
export type ContentShape<
    O extends Table = Table,
    C extends Table = Table,
    V extends Table = Table,
> = {
    /** The resource row: `entries`, `globals`. */
    table: O;
    /** One row per locale of what editors author: `entry_content`. */
    contentTable: C;
    /** Snapshots of a content row: `entry_versions`. */
    versionsTable: V;
    /** The content table's FK column to the resource row: `entryId`, `globalId`. */
    ownerColumn: string;
    /**
     * Content columns copied from the resource row when a content row is
     * inserted and the write does not name them — entries' denormalized `type`.
     */
    inheritedColumns?: readonly string[];
    /**
     * Values for the resource's own content columns on an insert that omits
     * them, so a `NOT NULL` column with no database default still writes —
     * entries' `title`.
     */
    insertDefaults?: Record<string, unknown>;
};

/**
 * The id of a row in a content table. Internal to the repository: it exists so
 * versions and `stagedFor` have a row to point at, and never crosses the
 * service boundary.
 */
export type ContentRowId = string & { readonly __brand: 'ContentRowId' };

/**
 * How a caller names one locale of one item. `id` is the resource id — the only
 * id that appears in a URL, a service call, a relation or a preview. A missing
 * `locale` means the repository's default content locale.
 */
export type ContentRef = {
    id: string;
    locale?: string | undefined;
};

/** What every resource's content read carries. */
export type ContentRow = {
    /** The resource id (`entries.id`, `globals.id`). */
    id: string;
    /** The content row this read came from. Never leaves the repository layer. */
    contentId: ContentRowId;
    locale: string;
    /** Every locale with a canonical content row, this one included. Sorted. */
    locales: string[];
    /** True when this read is the staged change rather than the canonical row. */
    staged: boolean;
    fields: JsonObject;
    /** The resource row's `createdAt` — when the item itself was created. */
    createdAt: Date;
    /** The content row's `updatedAt` — this locale's last edit. */
    updatedAt: Date;
    createdBy?: string | null;
    updatedBy?: string | null;
    status?: EntryStatus;
    publishedAt?: Date | null;
};

/**
 * A column-level write to a content row. Keys whose value is `undefined` are
 * left untouched on update (the codec drops them), so callers may spread a
 * partial validated payload without filtering. A resource's own content columns
 * (`title`, `slug`) ride along under the index signature and pass through.
 */
export type ContentWrite = {
    fields?: JsonObject | undefined;
    status?: EntryStatus | undefined;
    publishedAt?: Date | null | undefined;
    locale?: string | undefined;
    createdBy?: string | null | undefined;
    updatedBy?: string | null | undefined;
    [column: string]: unknown;
};

/**
 * A version snapshot. `contentId`, `version`, `fields` and `createdBy` are the
 * shared columns; a resource's own snapshot columns ride along and are written
 * as given.
 */
export type NewVersionSnapshot = {
    contentId: ContentRowId;
    version: number;
    fields: JsonObject;
    createdBy: string | null;
    [column: string]: unknown;
};

/** Extra conditions on the resource row, ANDed into every joined read. */
export type OwnerFilter = (
    eb: ExpressionBuilder<Record<string, Record<string, unknown>>, string>,
    opts: { includeTrashed?: boolean | undefined }
) => Expression<SqlBool>[];

/** The reads and writes a resource's own repository composes over. */
export type ContentRepository<R extends ContentRow, V extends Table = Table> = {
    /**
     * One canonical (non-staged) content row of one item, or null. No fallback
     * to another locale.
     */
    get(ref: ContentRef, opts?: { includeTrashed?: boolean }): Promise<R | null>;
    /**
     * The item in any one locale — the default content locale when it has a
     * row, else whichever comes first alphabetically.
     */
    anyLocale(id: string, opts?: { includeTrashed?: boolean }): Promise<R | null>;
    /** Insert the resource row (`own` columns) and its first content row. */
    create(own: Record<string, unknown>, content: ContentWrite): Promise<R>;
    /** Write one locale's content row, creating it when it does not exist. */
    update(ref: ContentRef, data: ContentWrite): Promise<R>;
    /** Hard-delete the resource row; content rows and versions cascade. */
    delete(id: string): Promise<void>;
    /** The canonical locales of each id, sorted. */
    locales(ids: string[]): Promise<Map<string, string[]>>;

    translatable: {
        /** The item's other canonical locales, excluding `excludeLocale`. */
        siblings(id: string, excludeLocale?: string): Promise<R[]>;
        /** Merge `values` into each sibling's fields. */
        propagateFields(
            id: string,
            excludeLocale: string,
            values: JsonObject
        ): Promise<void>;
    };

    staging: {
        /** The staged change for one locale, or null. */
        getByCanonical(id: string, locale?: string): Promise<R | null>;
        /** Add a second content row for that locale, staged for the canonical. */
        create(ref: ContentRef, data: ContentWrite): Promise<R>;
        /** Write that locale's staged content row; it must already exist. */
        update(ref: ContentRef, data: ContentWrite): Promise<R>;
        /** Discard the staged content row for that locale. */
        delete(ref: ContentRef): Promise<void>;
    };

    versions: ContentVersions<TableSelect<V>>;

    /**
     * The joined `resource ⋈ content` read, for a resource whose own queries
     * need it (entries' `list`). Rows come back encoded; `rows` decodes them
     * and attaches each row's locale list.
     */
    query: {
        db(): GenericDb;
        /** The Kysely `DB` keys of the two tables, for a hand-built query. */
        ownerKey: string;
        contentKey: string;
        /** A `SELECT` over the join, with every column of both tables. */
        joined(): JoinedQuery;
        /** `COUNT(*)` over the same join under the same predicate. */
        count(where: JoinedWhere): Promise<number>;
        rows(raw: Record<string, unknown>[]): Promise<R[]>;
    };
};

/** A predicate over the joined tables, in Kysely's expression-builder form. */
export type JoinedWhere = (
    eb: ExpressionBuilder<Record<string, Record<string, unknown>>, string>
) => Expression<SqlBool>;

/**
 * The joined read query. Table names come from the shape at runtime, so Kysely
 * cannot infer literal table keys here; this is the surface a resource query
 * actually uses, over encoded rows.
 */
export type JoinedQuery = {
    where(fn: JoinedWhere): JoinedQuery;
    orderBy(column: string, direction: 'asc' | 'desc'): JoinedQuery;
    limit(count: number): JoinedQuery;
    offset(count: number): JoinedQuery;
    execute(): Promise<Record<string, unknown>[]>;
    executeTakeFirst(): Promise<Record<string, unknown> | undefined>;
};

/** The versions group, keyed on the content row a version snapshots. */
export type ContentVersions<Row = Record<string, unknown>> = {
    /** Every version of a content row, newest first. */
    list(contentId: ContentRowId): Promise<Row[]>;
    get(versionId: string): Promise<Row | null>;
    create(snapshot: NewVersionSnapshot): Promise<void>;
    /** The highest version number for a content row; 0 when it has none. */
    latestNumber(contentId: ContentRowId): Promise<number>;
};

/**
 * Build a resource's content repository. `decode` turns one joined row into the
 * resource's row shape; `ownerFilter` adds a predicate on the resource row that
 * every read applies (entries' `deletedAt IS NULL`).
 */
export type ContentRepositoryOptions<
    R extends ContentRow,
    O extends Table,
    C extends Table,
> = {
    db?: Db | undefined;
    defaultLocale?: string | undefined;
    decode: (own: TableSelect<O>, content: TableSelect<C>, locales: string[]) => R;
    ownerFilter?: OwnerFilter | undefined;
};
