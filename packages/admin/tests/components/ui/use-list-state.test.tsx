/**
 * @vitest-environment happy-dom
 *
 * `useListState` reads the search, sort and page from the URL, derives the
 * fetch's `limit` and `offset`, and writes changes back while keeping a
 * route's own params. `validateListSearch` drops params that do not parse.
 */

import type { ListState } from '@/admin/components/ui/use-list-state';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useListState, validateListSearch } from '@/admin/components/ui/use-list-state';

/** Mount a route that holds the hook's result in `state`, at `url`. */
function mountState(url: string) {
    const holder: { state: ListState | null } = { state: null };
    function Probe() {
        holder.state = useListState({ pageSize: 10 });
        return <p>ready</p>;
    }
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const listRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/list',
        // A route's own param beside the list's, as the entries list has `status`.
        validateSearch: (search: Record<string, unknown>) => ({
            ...validateListSearch(search),
            ...(typeof search['status'] === 'string' ? { status: search['status'] } : {}),
        }),
        component: Probe,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([listRoute]),
        history: createMemoryHistory({ initialEntries: [url] }),
    });
    render(<RouterProvider router={router} />);
    const state = (): ListState => {
        if (holder.state === null) throw new Error('the probe has not rendered');
        return holder.state;
    };
    return { router, state };
}

describe('useListState', () => {
    it('reads the search, sort and page, and derives the fetch window', async () => {
        const { state } = mountState('/list?q=hello&sort=title:desc&page=3');
        await screen.findByText('ready');

        expect(state()).toMatchObject({
            q: 'hello',
            sort: { key: 'title', direction: 'desc' },
            page: 3,
            limit: 10,
            offset: 20,
        });
    });

    it('defaults to the first page with no search or sort', async () => {
        const { state } = mountState('/list');
        await screen.findByText('ready');

        expect(state()).toMatchObject({ q: '', sort: null, page: 1, offset: 0 });
    });

    it('keeps a route param and drops the page when the search changes', async () => {
        const { router, state } = mountState('/list?status=published&page=2');
        await screen.findByText('ready');

        act(() => state().setQuery('abc'));

        await waitFor(() =>
            expect(router.state.location.search).toEqual({
                status: 'published',
                q: 'abc',
            })
        );
    });

    it('clears the sort and returns to the first page', async () => {
        const { router, state } = mountState('/list?sort=title:asc&page=4');
        await screen.findByText('ready');

        act(() => state().setSort('title', null));

        await waitFor(() => expect(router.state.location.search).toEqual({}));
    });

    it('writes a filter, clears one set to undefined, and drops the page', async () => {
        const { router, state } = mountState('/list?status=published&q=a&page=2');
        await screen.findByText('ready');

        act(() => state().setFilters({ status: undefined }));
        await waitFor(() => expect(router.state.location.search).toEqual({ q: 'a' }));

        act(() => state().setFilters({ status: 'scheduled' }));
        await waitFor(() =>
            expect(router.state.location.search).toEqual({ q: 'a', status: 'scheduled' })
        );
    });

    it('leaves the first page out of the URL', async () => {
        const { router, state } = mountState('/list?page=3');
        await screen.findByText('ready');

        act(() => state().setPage(2));
        await waitFor(() => expect(router.state.location.search).toEqual({ page: 2 }));

        act(() => state().setPage(1));
        await waitFor(() => expect(router.state.location.search).toEqual({}));
    });
});

describe('validateListSearch', () => {
    it('keeps the params that parse', () => {
        expect(validateListSearch({ q: 'x', sort: 'from:asc', page: '2' })).toEqual({
            q: 'x',
            sort: 'from:asc',
            page: 2,
        });
    });

    it('drops an empty search, a malformed sort and a first or invalid page', () => {
        expect(validateListSearch({ q: '', sort: 'from', page: 1 })).toEqual({});
        expect(validateListSearch({ sort: 'from:sideways', page: 'two' })).toEqual({});
        expect(validateListSearch({ sort: ':asc' })).toEqual({});
    });
});
