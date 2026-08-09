/**
 * Turns media browsing state into a page of results. Both the library page and
 * the field picker run this, so neither maps query params itself.
 */

import { useMediaQuery } from './media';
import type { MediaBrowserQuery } from '@/admin/types/media';
import type { Media } from '@/types/index';

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
    const { q, type: typeFilter, sort, dir } = query;
    const currentPage = Math.max(1, query.page);

    const { data, isLoading, isError } = useMediaQuery({
        ...(q ? { search: q } : {}),
        ...(typeFilter !== 'all' ? { where: { mimeType: typeFilter } } : {}),
        ...(sort ? { sort: { [sort]: dir ?? 'asc' } } : {}),
        page: currentPage,
        limit: perPage,
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
