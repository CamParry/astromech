export const MEDIA_ACCEPT = 'image/*,video/*,application/pdf';

export type ViewMode = 'grid' | 'list';

export type TypeFilter = 'all' | 'images' | 'videos' | 'documents' | 'other';

export const TYPE_FILTER_OPTIONS = [
    { value: 'all',       label: 'All' },
    { value: 'images',    label: 'Images' },
    { value: 'videos',    label: 'Videos' },
    { value: 'documents', label: 'Documents' },
    { value: 'other',     label: 'Other' },
] as const satisfies { value: TypeFilter; label: string }[];

export const TYPE_FILTER_LABELS: Record<TypeFilter, string> = Object.fromEntries(
    TYPE_FILTER_OPTIONS.map((o) => [o.value, o.label])
) as Record<TypeFilter, string>;
