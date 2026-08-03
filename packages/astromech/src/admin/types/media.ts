export const MEDIA_ACCEPT = 'image/*,video/*,application/pdf';

export type ViewMode = 'grid' | 'list';

export type TypeFilter = 'all' | 'images' | 'videos' | 'documents' | 'other';

export const TYPE_FILTER_VALUES = [
    'all',
    'images',
    'videos',
    'documents',
    'other',
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

/** Columns the media list can be ordered by; must match the storage allowlist. */
export type MediaSortKey = 'filename' | 'mimeType' | 'size' | 'createdAt';

export const MEDIA_SORT_KEYS = [
    'filename',
    'mimeType',
    'size',
    'createdAt',
] as const satisfies readonly MediaSortKey[];

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
    return (MEDIA_SORT_KEYS as readonly string[]).includes(key);
}
