/**
 * Query primitive types — the vocabulary shared by every domain's `query`
 * method (locale sentinels, sort, where filters, pagination).
 */

import type { Entry } from './domain';

/** Sentinel for query({ locale }) meaning "rows across all locales". */
export type AllLocales = 'all';

export type SortDirection = 'asc' | 'desc';

/** Drizzle-style: `{ createdAt: 'desc' }` or `[{ status: 'asc' }, { createdAt: 'desc' }]`. */
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

export type UserQueryParams = {
    search?: string;
    page?: number;
    limit?: number | 'all';
    sort?: SortOption | SortOption[];
};

export type MediaMimeTypeFilter = 'images' | 'videos' | 'documents' | 'other';

export type MediaQueryParams = {
    /** The locale each item's content is read in. Default: the default locale. */
    locale?: string;
    search?: string;
    where?: {
        mimeType?: MediaMimeTypeFilter;
    };
    page?: number;
    limit?: number | 'all';
    sort?: SortOption | SortOption[];
};
