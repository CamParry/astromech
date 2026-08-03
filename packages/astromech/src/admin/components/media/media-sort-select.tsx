/**
 * Sort control for a media grid, which has no column headers to sort by.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/admin/components/ui/index.js';
import type { SortDirection } from '@/admin/components/ui/table.js';
import { isSortKey } from '@/admin/types/media.js';
import type { MediaBrowserQuery } from '@/admin/types/media.js';

const SORT_NONE = 'none';

export type MediaSortSelectProps = {
    query: MediaBrowserQuery;
    onQueryChange: (next: Partial<MediaBrowserQuery>) => void;
};

export function MediaSortSelect({
    query,
    onQueryChange,
}: MediaSortSelectProps): React.ReactElement {
    const { t } = useTranslation();
    const { sort, dir } = query;

    function handleSortSelect(value: string | null): void {
        const [key = '', direction] = (value ?? '').split(':');
        if (!isSortKey(key)) {
            onQueryChange(sortPatch(key, null));
            return;
        }
        onQueryChange(sortPatch(key, direction === 'desc' ? 'desc' : 'asc'));
    }

    return (
        <Select
            value={sort ? `${sort}:${dir ?? 'asc'}` : SORT_NONE}
            onValueChange={handleSortSelect}
            options={sortOptions(t)}
            triggerPrefix={t('media.sortPrefix')}
            className="am-select-trigger-auto"
        />
    );
}

/** The query patch for a sort change; table headers apply it too. */
export function sortPatch(
    key: string,
    direction: SortDirection
): Partial<MediaBrowserQuery> {
    if (direction === null || !isSortKey(key)) {
        return { sort: undefined, dir: undefined, page: 1 };
    }
    return { sort: key, dir: direction, page: 1 };
}

/** The four sortable columns in both directions, plus the unsorted default. */
function sortOptions(t: (key: string) => string): { value: string; label: string }[] {
    return [
        { value: SORT_NONE, label: t('media.sortDefault') },
        { value: 'filename:asc', label: t('media.sortFilenameAsc') },
        { value: 'filename:desc', label: t('media.sortFilenameDesc') },
        { value: 'mimeType:asc', label: t('media.sortMimeTypeAsc') },
        { value: 'mimeType:desc', label: t('media.sortMimeTypeDesc') },
        { value: 'size:asc', label: t('media.sortSizeAsc') },
        { value: 'size:desc', label: t('media.sortSizeDesc') },
        { value: 'createdAt:desc', label: t('media.sortCreatedAtDesc') },
        { value: 'createdAt:asc', label: t('media.sortCreatedAtAsc') },
    ];
}
