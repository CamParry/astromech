/**
 * The entries list's state, after react-admin's `useListController`: the
 * filter, sort and page held in the URL, the query they drive, and typed
 * setters. The URL keeps the state across refresh, back and a shared link.
 */

import type { EntriesListSearch } from '../utilities/entry-admin-path';
import type { UseAdminEntryTypeResult } from './use-admin-entry-type';
import type { Entry } from 'astromech';
import { useNavigate, useSearch } from '@tanstack/react-router';
import React from 'react';
import { defaultContentLocale } from '../utilities/content-locale';
import { useEntriesQuery } from './entries';

export type StatusFilter = 'all' | 'unpublished' | 'published' | 'scheduled' | 'trashed';

/** The locale filter's value for "every locale". */
export const LOCALE_FILTER_ALL = '__all__';

export type ListSort = { key: string; direction: 'asc' | 'desc' };

/** A partial search update; an explicit `undefined` clears that key. */
type SearchPatch = { [K in keyof EntriesListSearch]?: EntriesListSearch[K] | undefined };

export function useListController(
    entryType: UseAdminEntryTypeResult,
    { perPage }: { perPage: number }
) {
    const { type, config } = entryType;
    const navigate = useNavigate();
    const search = useSearch({ strict: false });
    const hasI18n = config.capabilities.translatable;

    const q = search.q ?? '';
    const status = (search.status ?? 'all') as StatusFilter;
    const page = search.page ?? 1;
    const locale = search.locale ?? defaultContentLocale();
    const sort = parseSort(search.sort);
    const isTrash = status === 'trashed';

    /** Apply a partial change in one navigation; a filter change returns to page one. */
    function setSearch(patch: SearchPatch): void {
        void navigate({ to: '.', search: mergeSearch(search, patch) });
    }

    const { data, isLoading } = useEntriesQuery({
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
        q,
        status,
        locale,
        sort,
        page,
        isTrash,
        setQuery: (value: string) =>
            setSearch({ q: value || undefined, page: undefined }),
        setStatus: (value: string | null) =>
            setSearch({
                status: value && value !== 'all' ? value : undefined,
                page: undefined,
            }),
        setLocale: (value: string | null) =>
            setSearch({
                locale: value && value !== defaultContentLocale() ? value : undefined,
                page: undefined,
            }),
        setSort: (key: string, direction: 'asc' | 'desc' | null) =>
            setSearch({
                sort: direction === null ? undefined : `${key}:${direction}`,
                page: undefined,
            }),
        setPage: (value: number) => setSearch({ page: value > 1 ? value : undefined }),
    };
}

/** The search after `patch`, with every cleared key left out. */
function mergeSearch(prev: SearchPatch, patch: SearchPatch): EntriesListSearch {
    const merged = { ...prev, ...patch };
    const next: EntriesListSearch = {};
    if (merged.q !== undefined) next.q = merged.q;
    if (merged.status !== undefined) next.status = merged.status;
    if (merged.locale !== undefined) next.locale = merged.locale;
    if (merged.sort !== undefined) next.sort = merged.sort;
    if (merged.page !== undefined) next.page = merged.page;
    return next;
}

/** Parse a `${key}:${direction}` URL sort param. */
function parseSort(raw: string | undefined): ListSort | null {
    if (raw === undefined) return null;
    const index = raw.lastIndexOf(':');
    const key = raw.slice(0, index);
    const direction = raw.slice(index + 1);
    if (index <= 0 || (direction !== 'asc' && direction !== 'desc')) return null;
    return { key, direction };
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
