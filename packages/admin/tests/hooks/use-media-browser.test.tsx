/**
 * @vitest-environment happy-dom
 *
 * The field picker maps its browsing state through this hook, so the params it
 * hands the transport must match the ones the library page sends.
 */

import type { MediaBrowserResult } from '@/admin/hooks/use-media-browser';
import type { MediaBrowserQuery } from '@/admin/types/media';
import type { Media, MediaQueryParams } from '@/types/index';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaBrowser } from '@/admin/hooks/use-media-browser';
import { renderAdminHook } from '../_support/render-admin';

const { mediaQuery } = vi.hoisted(() => ({ mediaQuery: vi.fn() }));

vi.mock('astromech/fetch', () => ({
    astromechUntypedClient: { media: { query: mediaQuery } },
}));

const ITEM: Media = {
    id: 'm1',
    filename: 'cat.png',
    mimeType: 'image/png',
    size: 2048,
    url: '/media/cat.png',
    width: null,
    height: null,
    metadata: null,
    alt: '',
    title: '',
    caption: '',
    fields: {},
    locale: 'en',
    locales: ['en'],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: null,
    updatedBy: null,
};

const BROWSING: MediaBrowserQuery = { q: '', type: 'all', page: 1 };

const PER_PAGE = 20;

beforeEach(() => {
    mediaQuery.mockResolvedValue({ data: [], pagination: { total: 0, pages: 1 } });
});

afterEach(() => {
    mediaQuery.mockReset();
});

/** Mount the hook over its own retry-free client, one cache per test. */
function mountBrowser(
    query: MediaBrowserQuery,
    perPage: number
): { result: { current: MediaBrowserResult } } {
    return renderAdminHook(() => useMediaBrowser(query, perPage));
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
        expect(await requestParams({ sort: undefined })).toStrictEqual({
            page: 1,
            limit: PER_PAGE,
        });
    });

    it('should pass an ascending sort', async () => {
        expect(
            await requestParams({ sort: { key: 'size', direction: 'asc' } })
        ).toStrictEqual({
            sort: { size: 'asc' },
            page: 1,
            limit: PER_PAGE,
        });
    });

    it('should pass a descending sort', async () => {
        expect(
            await requestParams({ sort: { key: 'size', direction: 'desc' } })
        ).toStrictEqual({
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
