/**
 * Turns the media picker's browsing state into a page of results. The library
 * page holds its state in the URL through `useListState` instead; both map
 * search, sort and page through `listQueryParams`.
 */

import type { MediaBrowserQuery } from '../types/media';
import type { Media } from 'astromech';
import { listQueryParams } from '../components/ui/use-list-state';
import { useMediaQuery } from './media';

export type MediaBrowserResult = {
    items: Media[];
    totalItems: number | undefined;
    totalPages: number;
    currentPage: number;
    isLoading: boolean;
    isError: boolean;
};

export function useMediaBrowser(
    query: MediaBrowserQuery,
    perPage: number
): MediaBrowserResult {
    const { q, type: typeFilter, sort } = query;
    const currentPage = Math.max(1, query.page);

    const { data, isLoading, isError } = useMediaQuery({
        ...listQueryParams({ q, sort: sort ?? null, page: currentPage }, perPage),
        ...(typeFilter !== 'all' ? { where: { mimeType: typeFilter } } : {}),
    });

    return {
        items: data?.data ?? [],
        totalItems: data?.pagination?.total,
        totalPages: Math.max(1, data?.pagination?.pages ?? 1),
        currentPage,
        isLoading,
        isError,
    };
}
