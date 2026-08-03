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
