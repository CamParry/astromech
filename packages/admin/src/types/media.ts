import type { MediaMimeTypeFilter } from 'astromech';
import { MEDIA_MIME_TYPE_FILTERS, MEDIA_SORT_FIELDS } from 'astromech/shared';

export const MEDIA_ACCEPT = 'image/*,video/*,application/pdf';

export type ViewMode = 'grid' | 'list';

/** A media list's type filter: one MIME class, or every file. */
export type TypeFilter = 'all' | MediaMimeTypeFilter;

export const TYPE_FILTER_VALUES = [
    'all',
    ...MEDIA_MIME_TYPE_FILTERS,
] as const satisfies readonly TypeFilter[];

/**
 * i18n key per filter value. A lookup rather than key concatenation so a new
 * filter value is a type error here instead of a missing key at runtime.
 */
export const TYPE_FILTER_KEYS: Record<TypeFilter, string> = {
    all: 'media.filterAll',
    images: 'media.filterImages',
    videos: 'media.filterVideos',
    documents: 'media.filterDocuments',
    other: 'media.filterOther',
};

/** A column the media list can be ordered by. */
export type MediaSortKey = (typeof MEDIA_SORT_FIELDS)[number];

/** The browsing state a media surface reads from: search, filter, sort, page. */
export type MediaBrowserQuery = {
    q: string;
    type: TypeFilter;
    /** Explicitly `| undefined`: clearing a sort passes it, under exactOptionalPropertyTypes. */
    sort?: MediaSortKey | undefined;
    dir?: 'asc' | 'desc' | undefined;
    page: number;
};

/** Narrow an arbitrary sort key to one the media API accepts. */
export function isSortKey(key: string): key is MediaSortKey {
    return (MEDIA_SORT_FIELDS as readonly string[]).includes(key);
}
