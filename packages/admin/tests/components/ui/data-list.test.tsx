/**
 * @vitest-environment happy-dom
 *
 * `DataList` over flat rows and `useListState`: it renders the rows, writes a
 * sort and a search to the URL and returns to the first page, waits for a pause
 * in typing before it searches, follows a search changed in the URL, links each row
 * (leaving a click on a control in it to the control), confirms a destructive
 * bulk action before running it, hands a custom body the selection, and shows
 * the empty, loading and error states.
 */

import type {
    DataListBulkAction,
    DataListColumn,
    DataListProps,
} from '@/admin/components/ui/data-list';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataList } from '@/admin/components/ui/data-list';
import { useListState, validateListSearch } from '@/admin/components/ui/use-list-state';
import { renderAdmin } from '../../_support/render-admin';

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

type ListOptions = {
    rows?: Redirect[];
    columns?: DataListColumn<Redirect>[];
    isLoading?: boolean;
    isError?: boolean;
    bulkActions?: DataListBulkAction[];
    renderBody?: DataListProps<Redirect>['renderBody'];
    onSearch?: (value: string) => void;
};

/** A redirects list over `useListState`, as a plugin page would write it. */
function RedirectsList({
    rows = REDIRECTS,
    columns = COLUMNS,
    isLoading = false,
    isError = false,
    bulkActions,
    renderBody,
    onSearch,
}: ListOptions) {
    const list = useListState();
    return (
        <DataList
            rows={rows}
            columns={columns}
            isLoading={isLoading}
            isError={isError}
            search={list.q}
            onSearch={(value) => {
                onSearch?.(value);
                list.setQuery(value);
            }}
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
            {...(renderBody !== undefined ? { renderBody } : {})}
            empty={<p>No redirects yet</p>}
        />
    );
}

/** Mount the list at `url` beside a redirect page its rows link to. */
function mountList(url: string, options: ListOptions = {}) {
    return renderAdmin(
        [
            {
                path: '/redirects',
                validateSearch: validateListSearch,
                component: () => <RedirectsList {...options} />,
            },
            { path: '/redirects/$id', component: () => <p>Redirect page</p> },
        ],
        { url }
    );
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
        const view = mountList('/redirects?page=2');
        await screen.findByText('/old');

        await userEvent.click(screen.getByRole('button', { name: /From/ }));

        await waitFor(() => expect(view.search()).toEqual({ sort: 'from:asc' }));
    });

    it('writes a search to the URL and returns to the first page', async () => {
        const view = mountList('/redirects?page=2&sort=from:desc');
        await screen.findByText('/old');

        fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'old' } });

        await waitFor(() =>
            expect(view.search()).toEqual({ q: 'old', sort: 'from:desc' })
        );
    });

    describe('search', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        /** Fake only the timer the search waits on, leaving React's and the router's alone. */
        function fakeTimers(): void {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        }

        it('searches once typing pauses, showing each keystroke before then', async () => {
            const onSearch = vi.fn();
            const view = mountList('/redirects', { onSearch });
            await screen.findByText('/old');
            const input = screen.getByRole<HTMLInputElement>('searchbox');
            fakeTimers();

            for (const value of ['o', 'ol', 'old']) {
                fireEvent.change(input, { target: { value } });
                act(() => vi.advanceTimersByTime(100));
            }

            expect(input.value).toBe('old');
            expect(onSearch).not.toHaveBeenCalled();
            expect(view.search()).toEqual({});

            await act(() => vi.advanceTimersByTimeAsync(250));

            expect(onSearch).toHaveBeenCalledOnce();
            expect(onSearch).toHaveBeenCalledWith('old');
            expect(view.search()).toEqual({ q: 'old' });
        });

        it('keeps a keystroke that lands while a search is on its way to the URL', async () => {
            const view = mountList('/redirects');
            await screen.findByText('/old');
            const input = screen.getByRole<HTMLInputElement>('searchbox');
            fakeTimers();

            fireEvent.change(input, { target: { value: 'ol' } });
            act(() => vi.advanceTimersByTime(250));
            // The next keystroke lands before the list renders `q=ol`.
            fireEvent.change(input, { target: { value: 'old' } });
            await act(() => vi.advanceTimersByTimeAsync(0));

            expect(view.search()).toEqual({ q: 'ol' });
            expect(input.value).toBe('old');

            await act(() => vi.advanceTimersByTimeAsync(250));
            expect(view.search()).toEqual({ q: 'old' });
            expect(input.value).toBe('old');
        });

        it('clears the search after the same pause', async () => {
            const onSearch = vi.fn();
            const view = mountList('/redirects?q=old', { onSearch });
            await screen.findByText('/old');
            const input = screen.getByRole<HTMLInputElement>('searchbox');
            fakeTimers();

            fireEvent.change(input, { target: { value: '' } });
            expect(input.value).toBe('');
            expect(onSearch).not.toHaveBeenCalled();

            await act(() => vi.advanceTimersByTimeAsync(250));

            expect(onSearch).toHaveBeenCalledWith('');
            expect(view.search()).toEqual({});
        });

        it('shows a search changed in the URL, dropping a pending one', async () => {
            const onSearch = vi.fn();
            const view = mountList('/redirects?q=old', { onSearch });
            await screen.findByText('/old');
            const input = screen.getByRole<HTMLInputElement>('searchbox');
            expect(input.value).toBe('old');

            fakeTimers();
            fireEvent.change(input, { target: { value: 'olde' } });
            await view.navigate('/redirects?q=gone');

            expect(input.value).toBe('gone');
            await act(() => vi.advanceTimersByTimeAsync(250));

            expect(onSearch).not.toHaveBeenCalled();
            expect(view.search()).toEqual({ q: 'gone' });
            expect(input.value).toBe('gone');
        });
    });

    it('links the row, and opens it on a click anywhere in the row', async () => {
        const view = mountList('/redirects');
        await screen.findByText('/old');

        expect(screen.getByRole('link', { name: '/old' }).getAttribute('href')).toBe(
            '/redirects/r1'
        );
        await userEvent.click(screen.getByText('/here'));

        await waitFor(() => expect(view.pathname()).toBe('/redirects/r2'));
    });

    it('leaves a row closed when a click lands on a control in it', async () => {
        const copy = vi.fn();
        const view = mountList('/redirects', {
            columns: [
                ...COLUMNS,
                {
                    key: 'copy',
                    label: 'Copy',
                    render: (row) => (
                        <button type="button" onClick={() => copy(row.to)}>
                            Copy {row.to}
                        </button>
                    ),
                },
            ],
        });

        await userEvent.click(await screen.findByRole('button', { name: 'Copy /new' }));
        const [firstMenu] = screen.getAllByRole('button', { name: 'Actions' });
        await userEvent.click(firstMenu as HTMLElement);

        // The menu opens on the list, so neither click left it.
        expect(await screen.findByRole('menuitem', { name: 'Edit /old' })).toBeTruthy();
        expect(copy).toHaveBeenCalledWith('/new');
        expect(view.pathname()).toBe('/redirects');
    });

    it('leaves a row closed when a click ends a text selection in it', async () => {
        const view = mountList('/redirects');
        const text = await screen.findByText('/here');

        window.getSelection()?.selectAllChildren(text);
        fireEvent.click(text);
        window.getSelection()?.removeAllRanges();
        // A later sort lands on the list only if the click did not leave it.
        await userEvent.click(screen.getByRole('button', { name: /From/ }));

        await waitFor(() => expect(view.search()).toEqual({ sort: 'from:asc' }));
        expect(view.pathname()).toBe('/redirects');
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

    it('hands a custom body the selection, so a grid offers bulk actions too', async () => {
        const publish = vi.fn();
        mountList('/redirects', {
            bulkActions: [{ label: 'Publish', run: publish }],
            renderBody: (rows, selection) => (
                <ul>
                    {rows.map((row) => (
                        <li key={row.id}>
                            <button
                                type="button"
                                aria-pressed={selection?.checkedIds.has(row.id)}
                                onClick={() => selection?.toggle(row.id)}
                            >
                                {row.from}
                            </button>
                        </li>
                    ))}
                </ul>
            ),
        });

        await userEvent.click(await screen.findByRole('button', { name: '/gone' }));
        await userEvent.click(screen.getByRole('button', { name: 'Bulk actions (1)' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Publish' }));

        expect(publish).toHaveBeenCalledWith(['r2']);
    });

    it('hands a custom body no selection when no bulk action is given', async () => {
        const renderBody = vi.fn(() => <p>Grid</p>);
        mountList('/redirects', { renderBody });

        expect(await screen.findByText('Grid')).toBeTruthy();
        expect(renderBody).toHaveBeenCalledWith(REDIRECTS, null);
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
