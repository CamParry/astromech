/**
 * Search and type controls for the media picker, rendered inside its toolbar.
 * The library page takes its search from `DataList` and only the type select
 * from here.
 */

import type { MediaBrowserQuery, TypeFilter } from '../../types/media';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '../../hooks/use-debounce';
import { TYPE_FILTER_KEYS, TYPE_FILTER_VALUES } from '../../types/media';
import { SearchInput } from '../ui/search-input';
import { Select } from '../ui/select';

const SEARCH_DEBOUNCE_MS = 250;

export type MediaFiltersProps = {
    query: MediaBrowserQuery;
    onQueryChange: (next: Partial<MediaBrowserQuery>) => void;
};

export function MediaFilters({
    query,
    onQueryChange,
}: MediaFiltersProps): React.ReactElement {
    const { t } = useTranslation();

    // The input is local so typing stays instant; only the settled value is
    // pushed to the host, which is what the request is built from.
    const [searchInput, setSearchInput] = useState(query.q);
    const debouncedSearch = useDebounce(searchInput, SEARCH_DEBOUNCE_MS);

    useEffect(() => {
        if (debouncedSearch === query.q) return;
        onQueryChange({ q: debouncedSearch, page: 1 });
    }, [debouncedSearch, query.q, onQueryChange]);

    return (
        <>
            <SearchInput
                placeholder={t('media.searchPlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
            />
            <MediaTypeSelect
                value={query.type}
                onChange={(type) => onQueryChange({ type, page: 1 })}
            />
        </>
    );
}

export type MediaTypeSelectProps = {
    value: TypeFilter;
    onChange: (value: TypeFilter) => void;
};

/** The type filter: one MIME class, or every file. */
export function MediaTypeSelect({
    value,
    onChange,
}: MediaTypeSelectProps): React.ReactElement {
    const { t } = useTranslation();

    return (
        <Select
            value={value}
            onValueChange={(next) => onChange((next ?? 'all') as TypeFilter)}
            options={TYPE_FILTER_VALUES.map((filter) => ({
                value: filter,
                label: t(TYPE_FILTER_KEYS[filter]),
            }))}
            triggerPrefix={t('media.typeFilterPrefix')}
            className="am-select-trigger-auto"
        />
    );
}
