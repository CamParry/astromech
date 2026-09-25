/**
 * The entries list's state, after react-admin's `useListController`: the
 * search, sort and page from `useListState`, plus the status and locale
 * filters and the entries query they drive, all held in the URL.
 */

import type { ListSort } from '../components/ui/use-list-state';
import type { UseAdminEntryTypeResult } from './use-admin-entry-type';
import type { Entry } from 'astromech';
import { useSearch } from '@tanstack/react-router';
import React from 'react';
import { useListState } from '../components/ui/use-list-state';
import { defaultContentLocale } from '../utilities/content-locale';
import { validateEntriesListSearch } from '../utilities/entry-admin-path';
import { useEntriesQuery } from './entries';

export type StatusFilter = 'all' | 'unpublished' | 'published' | 'scheduled' | 'trashed';

/** The locale filter's value for "every locale". */
export const LOCALE_FILTER_ALL = '__all__';

export function useListController(
    entryType: UseAdminEntryTypeResult,
    { perPage }: { perPage: number }
) {
    const { type, config } = entryType;
    const list = useListState({ pageSize: perPage });
    const raw: Record<string, unknown> = useSearch({ strict: false });
    const search = validateEntriesListSearch(raw);
    const hasI18n = config.capabilities.translatable;

    const status = (search.status ?? 'all') as StatusFilter;
    const locale = search.locale ?? defaultContentLocale();
    const isTrash = status === 'trashed';
    const { q, sort, page } = list;

    const { data, isLoading, isError } = useEntriesQuery({
        type,
        locale: !hasI18n || locale === LOCALE_FILTER_ALL ? 'all' : locale,
        ...(isTrash ? { trashed: true } : status !== 'all' ? { where: { status } } : {}),
        page,
        limit: perPage,
        search: q,
        ...(sort ? { sort: { [sort.key]: sort.direction } } : {}),
    });

    const rows = data?.data;
    const sorted = React.useMemo(() => sortPage(rows ?? [], sort), [rows, sort]);

    return {
        data: sorted,
        total: data?.pagination?.total ?? 0,
        pages: data?.pagination?.pages ?? 1,
        isLoading,
        isError,
        q,
        status,
        locale,
        sort,
        page,
        isTrash,
        setQuery: list.setQuery,
        setStatus: (value: string | null) =>
            list.setFilters({ status: value && value !== 'all' ? value : undefined }),
        setLocale: (value: string | null) =>
            list.setFilters({
                locale: value && value !== defaultContentLocale() ? value : undefined,
            }),
        setSort: list.setSort,
        setPage: list.setPage,
    };
}

/** Order one page by the sort column, which may be a system column or a field. */
function sortPage(entries: Entry[], sort: ListSort | null): Entry[] {
    if (sort === null) return entries;
    const value = (entry: Entry): string => {
        const raw =
            sort.key === 'title'
                ? entry.title
                : sort.key === 'updatedAt'
                  ? entry.updatedAt
                  : (entry.fields as Record<string, unknown>)[sort.key];
        return String(raw ?? '');
    };
    return [...entries].sort((a, b) =>
        sort.direction === 'asc'
            ? value(a).localeCompare(value(b))
            : value(b).localeCompare(value(a))
    );
}
