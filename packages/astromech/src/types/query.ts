/**
 * Query primitive types — the vocabulary shared by every domain's `query`
 * method (locale sentinels, sort, where filters, pagination).
 *
 * Every optional key reads `?: T | undefined`: these types describe a parsed
 * call, which is how Zod types an optional key, and `exactOptionalPropertyTypes`
 * keeps that distinct from a bare `T`.
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

export type EntryQueryParams = {
    /** Single type or array of types. Required at the runtime surface. */
    type?: string | readonly string[] | undefined;
    search?: string | undefined;
    where?: WhereFilters | undefined;
    trashed?: boolean | undefined;
    page?: number | undefined;
    limit?: number | 'all' | undefined;
    sort?: SortOption | SortOption[] | undefined;
    /** Locale code, or `'all'` for rows across every locale. Defaults to configured `defaultLocale`. */
    locale?: string | AllLocales | undefined;
    /** Request the full (admin) shape instead of the default public shape. */
    full?: boolean | undefined;
    /**
     * Preview token (forward versioning). When valid for the matched canonical
     * entry, the publish/schedule gate is bypassed for it (public shape only),
     * so an unpublished/scheduled entry — or its staged change — is returned.
     * Invalid/absent → normal public behaviour (non-published → nothing).
     */
    previewToken?: string | undefined;
    /** With a valid `previewToken`, preview the staged change instead of the current entry. */
    staged?: boolean | undefined;
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

export type UserQueryParams = {
    /** The locale each user's content is read in. Default: the default locale. */
    locale?: string | undefined;
    search?: string | undefined;
    page?: number | undefined;
    limit?: number | 'all' | undefined;
    sort?: SortOption | SortOption[] | undefined;
};

/** The classes of file a media list can be filtered to, by MIME type. */
export const MEDIA_MIME_TYPE_FILTERS = [
    'images',
    'videos',
    'documents',
    'other',
] as const;

/** One of {@link MEDIA_MIME_TYPE_FILTERS}. */
export type MediaMimeTypeFilter = (typeof MEDIA_MIME_TYPE_FILTERS)[number];

/** The columns a media list can be ordered by. */
export const MEDIA_SORT_FIELDS = ['filename', 'mimeType', 'size', 'createdAt'] as const;

export type MediaQueryParams = {
    /** The locale each item's content is read in. Default: the default locale. */
    locale?: string | undefined;
    search?: string | undefined;
    where?:
        | {
              mimeType?: MediaMimeTypeFilter | undefined;
          }
        | undefined;
    page?: number | undefined;
    limit?: number | 'all' | undefined;
    sort?: SortOption | SortOption[] | undefined;
};
