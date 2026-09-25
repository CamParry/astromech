/**
 * @vitest-environment happy-dom
 *
 * `DataList` over flat rows and `useListState`: it renders the rows, writes a
 * sort and a search to the URL and returns to the first page, links each row,
 * confirms a destructive bulk action before running it, and shows the empty,
 * loading and error states.
 */

import type { DataListBulkAction, DataListColumn } from '@/admin/components/ui/data-list';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import { DataList } from '@/admin/components/ui/data-list';
import { useListState, validateListSearch } from '@/admin/components/ui/use-list-state';
import en from '@/admin/locales/en.json';

type Redirect = { id: string; from: string; to: string; statusCode: number };

const REDIRECTS: Redirect[] = [
    { id: 'r1', from: '/old', to: '/new', statusCode: 301 },
    { id: 'r2', from: '/gone', to: '/here', statusCode: 302 },
];

const COLUMNS: DataListColumn<Redirect>[] = [
    { key: 'from', label: 'From', sortable: true, link: true, render: (row) => row.from },
    { key: 'to', label: 'To', render: (row) => row.to },
    { key: 'statusCode', label: 'Status', render: (row) => String(row.statusCode) },
];

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
});

type ListOptions = {
    rows?: Redirect[];
    isLoading?: boolean;
    isError?: boolean;
    bulkActions?: DataListBulkAction[];
};

/** A redirects list over `useListState`, as a plugin page would write it. */
function RedirectsList({
    rows = REDIRECTS,
    isLoading = false,
    isError = false,
    bulkActions,
}: ListOptions) {
    const list = useListState();
    return (
        <DataList
            rows={rows}
            columns={COLUMNS}
            isLoading={isLoading}
            isError={isError}
            search={list.q}
            onSearch={list.setQuery}
            sort={list.sort}
            onSort={list.setSort}
            page={list.page}
            pages={3}
            onPage={list.setPage}
            rowHref={(row) => `/redirects/${row.id}`}
            rowActions={(row) => [
                { label: `Edit ${row.from}`, href: `/redirects/${row.id}` },
            ]}
            {...(bulkActions !== undefined ? { bulkActions } : {})}
            empty={<p>No redirects yet</p>}
        />
    );
}

/** Mount the list at `url` under a real router, and return the router. */
function mountList(url: string, options: ListOptions = {}) {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const listRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/redirects',
        validateSearch: validateListSearch,
        component: () => <RedirectsList {...options} />,
    });
    const editRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/redirects/$id',
        component: () => <p>Redirect page</p>,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([listRoute, editRoute]),
        history: createMemoryHistory({ initialEntries: [url] }),
    });
    render(
        <ConfirmProvider>
            <RouterProvider router={router} />
        </ConfirmProvider>
    );
    return router;
}

describe('DataList', () => {
    it('renders a row per item with each column', async () => {
        mountList('/redirects');

        const row = (await screen.findByText('/old')).closest('tr');
        expect(row).not.toBeNull();
        expect(within(row as HTMLElement).getByText('/new')).toBeTruthy();
        expect(within(row as HTMLElement).getByText('301')).toBeTruthy();
        expect(screen.getByText('/gone')).toBeTruthy();
    });

    it('writes a sort to the URL and returns to the first page', async () => {
        const router = mountList('/redirects?page=2');
        await screen.findByText('/old');

        await userEvent.click(screen.getByRole('button', { name: /From/ }));

        await waitFor(() =>
            expect(router.state.location.search).toEqual({ sort: 'from:asc' })
        );
    });

    it('writes a search to the URL and returns to the first page', async () => {
        const router = mountList('/redirects?page=2&sort=from:desc');
        await screen.findByText('/old');

        fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'old' } });

        await waitFor(() =>
            expect(router.state.location.search).toEqual({ q: 'old', sort: 'from:desc' })
        );
    });

    it('links the row, and opens it on a click anywhere in the row', async () => {
        const router = mountList('/redirects');
        await screen.findByText('/old');

        expect(screen.getByRole('link', { name: '/old' }).getAttribute('href')).toBe(
            '/redirects/r1'
        );
        await userEvent.click(screen.getByText('/here'));

        await waitFor(() => expect(router.state.location.pathname).toBe('/redirects/r2'));
    });

    it('confirms a destructive bulk action, then runs it with the selected ids', async () => {
        const remove = vi.fn(() => Promise.resolve());
        mountList('/redirects', {
            bulkActions: [{ label: 'Delete', tone: 'danger', run: remove }],
        });
        await screen.findByText('/old');

        const [firstRow] = screen.getAllByRole('checkbox', { name: 'Select row' });
        await userEvent.click(firstRow as HTMLElement);
        await userEvent.click(screen.getByRole('button', { name: 'Bulk actions (1)' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

        expect(await screen.findByText('Delete 1 item?')).toBeTruthy();
        expect(remove).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

        expect(remove).toHaveBeenCalledWith(['r1']);
        await waitFor(() =>
            expect(screen.queryByRole('button', { name: /Bulk actions/ })).toBeNull()
        );
    });

    it('runs a bulk action that is not destructive without asking', async () => {
        const publish = vi.fn();
        mountList('/redirects', {
            bulkActions: [{ label: 'Publish', run: publish }],
        });
        await screen.findByText('/old');

        await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
        await userEvent.click(screen.getByRole('button', { name: 'Bulk actions (2)' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Publish' }));

        expect(publish).toHaveBeenCalledWith(['r1', 'r2']);
    });

    it('offers no selection when no bulk action is given', async () => {
        mountList('/redirects');
        await screen.findByText('/old');

        expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('shows the empty state when there are no rows', async () => {
        mountList('/redirects', { rows: [] });

        expect(await screen.findByText('No redirects yet')).toBeTruthy();
    });

    it('marks the table busy while loading, and shows no rows', async () => {
        mountList('/redirects', { isLoading: true });

        await waitFor(() =>
            expect(screen.getByRole('table').getAttribute('aria-busy')).toBe('true')
        );
        expect(screen.queryByText('/old')).toBeNull();
    });

    it('shows the error state when the rows fail to load', async () => {
        mountList('/redirects', { isError: true });

        expect(await screen.findByText('The list could not be loaded.')).toBeTruthy();
        expect(screen.queryByText('/old')).toBeNull();
    });
});
