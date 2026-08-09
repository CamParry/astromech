/**
 * Search and type controls for a media surface, rendered inside its toolbar.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchInput, Select } from '@/admin/components/ui/index';
import { useDebounce } from '@/admin/hooks/use-debounce';
import { TYPE_FILTER_KEYS, TYPE_FILTER_VALUES } from '@/admin/types/media';
import type { MediaBrowserQuery, TypeFilter } from '@/admin/types/media';

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
    // pushed to the host, which is what the request and any URL are built from.
    const [searchInput, setSearchInput] = useState(query.q);
    const debouncedSearch = useDebounce(searchInput, SEARCH_DEBOUNCE_MS);

    useEffect(() => {
        if (debouncedSearch === query.q) return;
        onQueryChange({ q: debouncedSearch, page: 1 });
    }, [debouncedSearch, query.q, onQueryChange]);

    function handleTypeChange(value: string | null): void {
        onQueryChange({ type: (value ?? 'all') as TypeFilter, page: 1 });
    }

    return (
        <>
            <SearchInput
                placeholder={t('media.searchPlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
            />
            <Select
                value={query.type}
                onValueChange={handleTypeChange}
                options={TYPE_FILTER_VALUES.map((value) => ({
                    value,
                    label: t(TYPE_FILTER_KEYS[value]),
                }))}
                triggerPrefix={t('media.typeFilterPrefix')}
                className="am-select-trigger-auto"
            />
        </>
    );
}
