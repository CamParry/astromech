/**
 * Sort control for a media grid, which has no column headers to sort by.
 */

import type { MediaBrowserQuery } from '../../types/media';
import type { SortDirection } from '../ui/table';
import type { ListSort } from '../ui/use-list-state';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { isSortKey } from '../../types/media';
import { Select } from '../ui/select';

const SORT_NONE = 'none';

export type MediaSortSelectProps = {
    sort: ListSort | null;
    /** Called as a sortable column header calls it; a `null` direction clears the sort. */
    onSort: (key: string, direction: SortDirection) => void;
};

export function MediaSortSelect({
    sort,
    onSort,
}: MediaSortSelectProps): React.ReactElement {
    const { t } = useTranslation();

    function handleSortSelect(value: string | null): void {
        const [key = '', direction] = (value ?? '').split(':');
        if (!isSortKey(key)) {
            onSort(key, null);
            return;
        }
        onSort(key, direction === 'desc' ? 'desc' : 'asc');
    }

    return (
        <Select
            value={sort ? `${sort.key}:${sort.direction}` : SORT_NONE}
            onValueChange={handleSortSelect}
            options={sortOptions(t)}
            triggerPrefix={t('media.sortPrefix')}
            className="am-select-trigger-auto"
        />
    );
}

/** The picker's query patch for a sort change. A key the API cannot sort by clears the sort. */
export function sortPatch(
    key: string,
    direction: SortDirection
): Partial<MediaBrowserQuery> {
    if (direction === null || !isSortKey(key)) {
        return { sort: undefined, page: 1 };
    }
    return { sort: { key, direction }, page: 1 };
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
