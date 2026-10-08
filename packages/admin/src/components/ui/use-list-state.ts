/**
 * A list's search, sort and page, held in the URL so they survive a refresh,
 * the back button and a shared link. A route's own filters sit beside them in
 * the same search, and `setFilters` writes those.
 */

import type { SortOption } from 'astromech';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo } from 'react';

/** The sort a list asks for: one column and a direction. */
export type ListSort = { key: string; direction: 'asc' | 'desc' };

/** The URL search params every list reads. */
export type ListSearch = {
    q?: string;
    /** `${columnKey}:${'asc' | 'desc'}` */
    sort?: string;
    page?: number;
};

/**
 * The keys every `query` service method and admin resource `list` method takes
 * for search, sort and page. A caller spreads in its own filters beside them.
 */
export type ListQueryParams = {
    search?: string;
    sort?: SortOption;
    /** The page, from 1. */
    page: number;
    limit: number;
};

export type UseListStateOptions = {
    /** Rows per page, which sets `limit` and `offset`. Defaults to 20. */
    pageSize?: number;
};

export type ListState = {
    /** The search text, or `''`. */
    q: string;
    sort: ListSort | null;
    /** The current page, from 1. */
    page: number;
    /** The page size, to pass to a fetch. */
    limit: number;
    /** The rows before this page, to pass to a fetch. */
    offset: number;
    /**
     * The search, sort and page as a `query` method takes them, to pass to a
     * fetch. An empty search and no sort are left out.
     */
    queryParams: ListQueryParams;
    /**
     * Set the search text and return to the first page. It replaces the
     * history entry rather than pushing one per keystroke.
     */
    setQuery: (value: string) => void;
    /** Sort by `key`, or clear the sort with `null`, and return to the first page. */
    setSort: (key: string, direction: 'asc' | 'desc' | null) => void;
    setPage: (page: number) => void;
    /** Write a route's own search params and return to the first page; `undefined` clears one. */
    setFilters: (patch: Record<string, unknown>) => void;
};

const DEFAULT_PAGE_SIZE = 20;

/**
 * Read and write a list's search, sort and page in the URL. A change to the
 * search, the sort or a filter returns to the first page.
 */
export function useListState({
    pageSize = DEFAULT_PAGE_SIZE,
}: UseListStateOptions = {}): ListState {
    const navigate = useNavigate();
    const raw: Record<string, unknown> = useSearch({ strict: false });
    const search = validateListSearch(raw);
    const q = search.q ?? '';
    const page = search.page ?? 1;
    // One object per sort param, so a memo keyed on it survives a re-render.
    const sort = useMemo(() => parseSort(search.sort), [search.sort]);

    function update(patch: Record<string, unknown>, replace = false): void {
        void navigate({
            to: '.',
            replace,
            search: (prev: Record<string, unknown>) =>
                withoutUndefined({ ...prev, ...patch }),
        });
    }

    return {
        q,
        sort,
        page,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        queryParams: listQueryParams({ q, sort, page }, pageSize),
        setQuery: (value) => update({ q: value || undefined, page: undefined }, true),
        setSort: (key, direction) =>
            update({
                sort: direction === null ? undefined : `${key}:${direction}`,
                page: undefined,
            }),
        setPage: (value) => update({ page: value > 1 ? value : undefined }),
        setFilters: (patch) => update({ ...patch, page: undefined }),
    };
}

/**
 * The search, sort and page as a `query` method takes them. An empty search
 * and no sort are left out.
 */
export function listQueryParams(
    { q, sort, page }: { q: string; sort: ListSort | null; page: number },
    limit: number
): ListQueryParams {
    return {
        ...(q ? { search: q } : {}),
        ...(sort ? { sort: { [sort.key]: sort.direction } } : {}),
        page,
        limit,
    };
}

/** Parse raw URL search into the list params, dropping any that do not parse. */
export function validateListSearch(search: Record<string, unknown>): ListSearch {
    const out: ListSearch = {};
    if (typeof search['q'] === 'string' && search['q']) out.q = search['q'];
    if (typeof search['sort'] === 'string' && parseSort(search['sort']) !== null) {
        out.sort = search['sort'];
    }
    const pageRaw = search['page'];
    const pageNumber =
        typeof pageRaw === 'number'
            ? pageRaw
            : typeof pageRaw === 'string'
              ? Number(pageRaw)
              : NaN;
    if (Number.isFinite(pageNumber) && pageNumber > 1) out.page = pageNumber;
    return out;
}

/** Parse a `${key}:${direction}` sort param. */
export function parseSort(raw: string | undefined): ListSort | null {
    if (raw === undefined) return null;
    const index = raw.lastIndexOf(':');
    const key = raw.slice(0, index);
    const direction = raw.slice(index + 1);
    if (index <= 0 || (direction !== 'asc' && direction !== 'desc')) return null;
    return { key, direction };
}

function withoutUndefined(search: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(search).filter(([, value]) => value !== undefined)
    );
}
