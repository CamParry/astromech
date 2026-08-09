/**
 * @vitest-environment happy-dom
 *
 * The library page and the field picker both map their browsing state through
 * this hook, so the params it hands the transport are the shared contract.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useMediaBrowser } from '@/admin/hooks/use-media-browser';
import type { MediaBrowserResult } from '@/admin/hooks/use-media-browser';
import type { MediaBrowserQuery } from '@/admin/types/media';
import type { Media, MediaQueryParams } from '@/types/index';

const { mediaQuery } = vi.hoisted(() => ({ mediaQuery: vi.fn() }));

vi.mock('@/transport/http/client/index', () => ({
    astromechClient: { media: { query: mediaQuery } },
}));

const ITEM: Media = {
    id: 'm1',
    filename: 'cat.png',
    mimeType: 'image/png',
    size: 2048,
    url: '/media/cat.png',
    alt: '',
    title: '',
    caption: '',
    fields: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: null,
};

const BROWSING: MediaBrowserQuery = { q: '', type: 'all', page: 1 };

const PER_PAGE = 20;

beforeEach(() => {
    mediaQuery.mockResolvedValue({ data: [], pagination: { total: 0, pages: 1 } });
});

afterEach(() => {
    cleanup();
    mediaQuery.mockReset();
});

/** Mount the hook over its own retry-free client, one cache per test. */
function mountBrowser(
    query: MediaBrowserQuery,
    perPage: number
): { result: { current: MediaBrowserResult } } {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });

    return renderHook(() => useMediaBrowser(query, perPage), {
        wrapper: ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
    });
}

/** The params the transport was called with for one mount of the hook. */
async function requestParams(
    query: Partial<MediaBrowserQuery>,
    perPage = PER_PAGE
): Promise<MediaQueryParams> {
    mountBrowser({ ...BROWSING, ...query }, perPage);
    await waitFor(() => expect(mediaQuery).toHaveBeenCalled());
    return mediaQuery.mock.calls[0]?.[0] as MediaQueryParams;
}

/** Mount against a fixed response and read the result once the query settles. */
async function settledResult(response: unknown): Promise<MediaBrowserResult> {
    mediaQuery.mockResolvedValue(response);
    const { result } = mountBrowser(BROWSING, PER_PAGE);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    return result.current;
}

describe('useMediaBrowser search params', () => {
    it('should omit search for an empty query string', async () => {
        expect(await requestParams({ q: '' })).toStrictEqual({
            page: 1,
            limit: PER_PAGE,
        });
    });

    it('should pass a non-empty query string as search', async () => {
        expect(await requestParams({ q: 'cat' })).toStrictEqual({
            search: 'cat',
            page: 1,
            limit: PER_PAGE,
        });
    });
});

describe('useMediaBrowser type params', () => {
    it('should omit where for the all filter', async () => {
        expect(await requestParams({ type: 'all' })).toStrictEqual({
            page: 1,
            limit: PER_PAGE,
        });
    });

    it('should pass any other filter as a mimeType condition', async () => {
        expect(await requestParams({ type: 'images' })).toStrictEqual({
            where: { mimeType: 'images' },
            page: 1,
            limit: PER_PAGE,
        });
    });

    it('should pass the documents filter as a mimeType condition', async () => {
        expect(await requestParams({ type: 'documents' })).toStrictEqual({
            where: { mimeType: 'documents' },
            page: 1,
            limit: PER_PAGE,
        });
    });
});

describe('useMediaBrowser sort params', () => {
    it('should omit sort when no column is chosen', async () => {
        expect(await requestParams({ sort: undefined, dir: undefined })).toStrictEqual({
            page: 1,
            limit: PER_PAGE,
        });
    });

    it('should default a sort with no direction to ascending', async () => {
        expect(await requestParams({ sort: 'size' })).toStrictEqual({
            sort: { size: 'asc' },
            page: 1,
            limit: PER_PAGE,
        });
    });

    it('should pass an explicit descending direction', async () => {
        expect(await requestParams({ sort: 'size', dir: 'desc' })).toStrictEqual({
            sort: { size: 'desc' },
            page: 1,
            limit: PER_PAGE,
        });
    });
});

describe('useMediaBrowser paging params', () => {
    it('should clamp page zero to the first page', async () => {
        expect(await requestParams({ page: 0 })).toStrictEqual({
            page: 1,
            limit: PER_PAGE,
        });
    });

    it('should clamp a negative page to the first page', async () => {
        expect(await requestParams({ page: -3 })).toStrictEqual({
            page: 1,
            limit: PER_PAGE,
        });
    });

    it('should pass a real page through unclamped', async () => {
        expect(await requestParams({ page: 4 })).toStrictEqual({
            page: 4,
            limit: PER_PAGE,
        });
    });

    it('should send perPage as the limit', async () => {
        expect(await requestParams({}, 24)).toStrictEqual({ page: 1, limit: 24 });
    });

    it('should report the clamped page as the current page', () => {
        const { result } = mountBrowser({ ...BROWSING, page: 0 }, PER_PAGE);

        expect(result.current.currentPage).toBe(1);
    });
});

describe('useMediaBrowser result', () => {
    it('should report the page count and total from the response', async () => {
        const result = await settledResult({
            data: [ITEM],
            pagination: { total: 47, pages: 3 },
        });

        expect(result.totalPages).toBe(3);
        expect(result.totalItems).toBe(47);
    });

    it('should fall back to one page when the response has no pagination', async () => {
        const result = await settledResult({ data: [ITEM] });

        expect(result.totalPages).toBe(1);
        expect(result.totalItems).toBeUndefined();
    });

    it('should fall back to an empty list when the response has no data', async () => {
        const result = await settledResult({});

        expect(result.items).toStrictEqual([]);
    });

    it('should return the items the response carried', async () => {
        const result = await settledResult({ data: [ITEM] });

        expect(result.items).toStrictEqual([ITEM]);
    });
});
