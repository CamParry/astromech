/**
 * The shapes the entry repository reads and writes: the resource it returns, a
 * write to a content row, the list filters and a preview token.
 */

import type { ContentRef, Resource } from '@/content/repository/types';
import type { EntryStatus, JsonObject, SortOption, WhereFilters } from '@/types/index';

/**
 * How a caller names one locale of one entry. `id` is the entry id — the only
 * id that appears in a URL, a service call, a relation or a preview. A missing
 * `locale` means the repository's default content locale.
 */
export type EntryRef = ContentRef;

/**
 * One locale of one entry as the repository returns it: the shared resource
 * shape plus the entry's own columns.
 */
export type EntryResource = Resource & {
    type: string;
    title: string;
    slug: string | null;
    status: EntryStatus;
    publishedAt: Date | null;
    deletedAt: Date | null;
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

/** What `findMany` and `count` filter by; `findMany` also orders and pages. */
export type ListParams = {
    type: string | readonly string[];
    locale?: string | 'all' | undefined;
    trashed?: boolean | undefined;
    /** Matches the title or the slug. */
    search?: string | undefined;
    where?: WhereFilters | undefined;
    /**
     * Only rows whose `publishedAt` is null or not after this time. `entries.query`
     * sets it for a public read, with the same time it gives `applyVisibility`.
     */
    publishedAsOf?: Date | undefined;
    sort?: SortOption | SortOption[] | undefined;
    /** Rows to return; absent means every match. `count` ignores it. */
    limit?: number | undefined;
    /** Rows to skip before the first returned. `count` ignores it. */
    offset?: number | undefined;
};

/** The entry a stored preview-token hash belongs to, and when it lapses. */
export type PreviewTokenRecord = {
    id: string;
    expiresAt: Date | null;
};
