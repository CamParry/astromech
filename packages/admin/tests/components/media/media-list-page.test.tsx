/**
 * @vitest-environment happy-dom
 *
 * The media library keeps its search, sort, page, type and open item in the
 * URL: the URL drives the query, a column sort and the type filter write it,
 * and a filename opens the detail modal. Bulk delete works from the table and
 * the grid, and steps back a page when it empties the last one. An empty
 * library invites an upload; an empty search says what matched nothing. A
 * user without `media:read` sees the forbidden message in place.
 */

import type { Media, QueryResult } from '@/types/index';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    MediaListPage,
    validateMediaListSearch,
} from '@/admin/components/media/media-list-page';
import { renderAdmin } from '../../_support/render-admin';

const { media } = vi.hoisted(() => ({
    media: {
        query: vi.fn(),
        delete: vi.fn(),
        // The detail modal's reads; a pending one keeps it loading.
        get: vi.fn(() => new Promise(() => undefined)),
        usedBy: vi.fn(() => new Promise(() => undefined)),
        versions: vi.fn(() => new Promise(() => undefined)),
    },
}));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: { ...real.astromechUntypedClient, media },
    };
});

function mediaItem(id: string, filename: string): Media {
    return {
        id,
        filename,
        mimeType: 'image/png',
        size: 2048,
        url: `/media/${filename}`,
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
}

function page(items: Media[], pageNumber = 1, pages = 1): QueryResult<Media> {
    return {
        data: items,
        pagination: { page: pageNumber, pages, total: items.length, limit: 20 },
    };
}

const PAGE = page([mediaItem('m1', 'cat.png'), mediaItem('m2', 'dog.png')]);

const VIEW_MODE_KEY = 'am:state:view-mode:media';

afterEach(() => {
    media.query.mockReset();
    media.delete.mockReset();
    localStorage.removeItem(VIEW_MODE_KEY);
});

/** Mount the library at `url`, as a table unless `grid`. */
function mountPage(
    url: string,
    { grid = false, permissions }: { grid?: boolean; permissions?: string[] } = {}
) {
    if (grid) localStorage.setItem(VIEW_MODE_KEY, 'grid');
    return renderAdmin(
        [
            {
                path: '/media',
                validateSearch: validateMediaListSearch,
                component: MediaListPage,
            },
        ],
        { url, ...(permissions !== undefined ? { permissions } : {}) }
    );
}

describe('validateMediaListSearch', () => {
    it('drops a sort by a column the API cannot sort by, and an unknown type', () => {
        expect(
            validateMediaListSearch({ sort: 'colour:asc', type: 'fonts', dir: 'desc' })
        ).toEqual({});
    });

    it('keeps a media sort, a type and an open item', () => {
        expect(
            validateMediaListSearch({ sort: 'size:desc', type: 'images', item: 'm1' })
        ).toEqual({ sort: 'size:desc', type: 'images', item: 'm1' });
    });
});

describe('the media library', () => {
    it('queries with the search, sort, page and type the URL holds', async () => {
        media.query.mockResolvedValue(PAGE);

        mountPage('/media?q=cat&sort=size:desc&page=2&type=images');

        expect(await screen.findByText('cat.png')).toBeTruthy();
        expect(media.query).toHaveBeenCalledWith({
            search: 'cat',
            sort: { size: 'desc' },
            page: 2,
            limit: 20,
            where: { mimeType: 'images' },
        });
    });

    it('writes a column sort to the URL and returns to the first page', async () => {
        media.query.mockResolvedValue(PAGE);
        const view = mountPage('/media?page=2');
        await screen.findByText('cat.png');

        await view.user.click(screen.getByRole('button', { name: /File/ }));

        await waitFor(() => expect(view.search()).toEqual({ sort: 'filename:asc' }));
    });

    it('writes the type filter to the URL and returns to the first page', async () => {
        media.query.mockResolvedValue(PAGE);
        const view = mountPage('/media?page=2');
        await screen.findByText('cat.png');

        await view.user.click(screen.getByRole('combobox'));
        await view.user.click(await screen.findByRole('option', { name: 'Images' }));

        await waitFor(() => expect(view.search()).toEqual({ type: 'images' }));
    });

    it('opens a file in the detail modal from its filename', async () => {
        media.query.mockResolvedValue(PAGE);
        const view = mountPage('/media?sort=size:asc');
        await screen.findByText('cat.png');

        await view.user.click(screen.getByRole('button', { name: 'cat.png' }));

        await waitFor(() =>
            expect(view.search()).toEqual({ sort: 'size:asc', item: 'm1' })
        );
        expect(await screen.findByRole('dialog')).toBeTruthy();
    });

    it('bulk deletes the ticked rows after asking', async () => {
        media.query.mockResolvedValue(PAGE);
        media.delete.mockResolvedValue({ success: true });
        const view = mountPage('/media');
        await screen.findByText('cat.png');

        const [firstRow] = screen.getAllByRole('checkbox', { name: 'Select row' });
        await view.user.click(firstRow as HTMLElement);
        await view.user.click(screen.getByRole('button', { name: 'Bulk actions (1)' }));
        await view.user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        expect(await screen.findByText('Delete 1 item?')).toBeTruthy();
        expect(media.delete).not.toHaveBeenCalled();
        await view.user.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(media.delete).toHaveBeenCalledWith({ id: 'm1' }));
        expect(media.delete).toHaveBeenCalledTimes(1);
    });

    it('steps back a page when a bulk delete empties the last one', async () => {
        media.query.mockResolvedValue(page([mediaItem('m3', 'owl.png')], 2, 2));
        media.delete.mockResolvedValue({ success: true });
        const view = mountPage('/media?page=2');
        await screen.findByText('owl.png');

        await view.user.click(screen.getByRole('checkbox', { name: 'Select all' }));
        await view.user.click(screen.getByRole('button', { name: 'Bulk actions (1)' }));
        await view.user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        await screen.findByText('Delete 1 item?');
        await view.user.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(view.search()).toEqual({}));
    });

    it('shows a user without media:read the forbidden message in place', async () => {
        const view = mountPage('/media', { permissions: ['users:read'] });

        expect(
            await screen.findByText("You don't have permission to view this page.")
        ).toBeTruthy();
        expect(view.pathname()).toBe('/media');
        expect(media.query).not.toHaveBeenCalled();
    });

    it('offers no selection without the delete permission', async () => {
        media.query.mockResolvedValue(PAGE);
        mountPage('/media', { permissions: ['media:read'] });
        await screen.findByText('cat.png');

        expect(screen.queryByRole('checkbox')).toBeNull();
    });
});

describe('the media library as a grid', () => {
    it('bulk deletes the ticked tiles', async () => {
        media.query.mockResolvedValue(PAGE);
        media.delete.mockResolvedValue({ success: true });
        const view = mountPage('/media', { grid: true });
        await screen.findByText('dog.png');

        expect(screen.queryByRole('table')).toBeNull();
        await view.user.click(screen.getByRole('checkbox', { name: 'Select dog.png' }));
        await view.user.click(screen.getByRole('button', { name: 'Bulk actions (1)' }));
        await view.user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        await screen.findByText('Delete 1 item?');
        await view.user.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(media.delete).toHaveBeenCalledWith({ id: 'm2' }));
    });

    it('selects every tile from the select-all bar', async () => {
        media.query.mockResolvedValue(PAGE);
        const view = mountPage('/media', { grid: true });
        await screen.findByText('dog.png');

        await view.user.click(screen.getByRole('checkbox', { name: 'Select all' }));

        expect(screen.getByRole('button', { name: 'Bulk actions (2)' })).toBeTruthy();
    });

    it('opens a file in the detail modal from its tile', async () => {
        media.query.mockResolvedValue(PAGE);
        const view = mountPage('/media', { grid: true });
        await screen.findByText('dog.png');

        await view.user.click(screen.getByRole('button', { name: /dog\.png/ }));

        await waitFor(() => expect(view.search()).toEqual({ item: 'm2' }));
    });

    it('offers a sort select, since a grid has no column headers', async () => {
        media.query.mockResolvedValue(PAGE);
        const view = mountPage('/media', { grid: true });
        await screen.findByText('dog.png');

        const [, sortSelect] = screen.getAllByRole('combobox');
        await view.user.click(sortSelect as HTMLElement);
        await view.user.click(
            await screen.findByRole('option', { name: 'Largest first' })
        );

        await waitFor(() => expect(view.search()).toEqual({ sort: 'size:desc' }));
    });

    it('offers no tile checkboxes without the delete permission', async () => {
        media.query.mockResolvedValue(PAGE);
        mountPage('/media', { grid: true, permissions: ['media:read'] });
        await screen.findByText('dog.png');

        expect(screen.queryByRole('checkbox')).toBeNull();
    });
});

describe('the empty media library', () => {
    it('invites an upload when nothing is filtered', async () => {
        media.query.mockResolvedValue(page([]));
        mountPage('/media');

        expect(
            await screen.findByText('Drop files here or click to upload')
        ).toBeTruthy();
    });

    it('names the search that matched nothing', async () => {
        media.query.mockResolvedValue(page([]));
        mountPage('/media?q=zebra');

        expect(await screen.findByText('No media matching "zebra"')).toBeTruthy();
        expect(screen.queryByText('Drop files here or click to upload')).toBeNull();
    });
});
