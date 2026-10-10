/**
 * @vitest-environment happy-dom
 *
 * The admin resource pages over the shim's `redirects` plugin: the list calls
 * the list method with the URL's search, sort and page and hides create, open
 * and delete without the method or its permission; the new page sends `{ data }`
 * and puts a 422 on its field; the edit page loads the row, saves it, renders
 * read-only without an update method or its permission, and shows not found.
 */

import type { AdminResourceRow, QueryResult } from '@/types/index';
import { useParams } from '@tanstack/react-router';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminResourceEditPage } from '@/admin/components/admin-resources/admin-resource-edit-page';
import { AdminResourceListPage } from '@/admin/components/admin-resources/admin-resource-list-page';
import { AdminResourceNewPage } from '@/admin/components/admin-resources/admin-resource-new-page';
import { validateListSearch } from '@/admin/components/ui/use-list-state';
import { AstromechApiError } from '@/transport/http/client';
import { renderAdmin } from '../../_support/render-admin';

const { rpc } = vi.hoisted(() => ({
    rpc: {
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        listHits: vi.fn(),
        getHit: vi.fn(),
        listEvents: vi.fn(),
    },
}));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: {
            ...real.astromechUntypedClient,
            plugins: { redirects: rpc },
        },
    };
});

const READ = 'plugin:redirects:read';
const WRITE = 'plugin:redirects:write';

const RULE: AdminResourceRow = { id: 'r1', from: '/old', to: '/new', statusCode: '301' };

function page(rows: AdminResourceRow[]): QueryResult<AdminResourceRow> {
    return {
        data: rows,
        pagination: { page: 1, pages: 1, total: rows.length, limit: 20 },
    };
}

afterEach(() => {
    for (const fn of Object.values(rpc)) fn.mockReset();
});

/** The params the three routes below match. */
type ResourceParams = { name: string; resource: string; id: string };

function ListRoute() {
    const { name, resource } = useParams({ strict: false }) as ResourceParams;
    return <AdminResourceListPage plugin={name} name={resource} />;
}

function NewRoute() {
    const { name, resource } = useParams({ strict: false }) as ResourceParams;
    return <AdminResourceNewPage plugin={name} name={resource} />;
}

function EditRoute() {
    const { name, resource, id } = useParams({ strict: false }) as ResourceParams;
    return <AdminResourceEditPage plugin={name} name={resource} id={id} />;
}

/** Mount the three pages under a real router at `url`, as a user holding `permissions`. */
function mount(url: string, permissions: string[] = [READ, WRITE]) {
    const view = renderAdmin(
        [
            {
                path: '/plugin/$name/resources/$resource',
                validateSearch: validateListSearch,
                component: ListRoute,
            },
            { path: '/plugin/$name/resources/$resource/new', component: NewRoute },
            { path: '/plugin/$name/resources/$resource/$id', component: EditRoute },
        ],
        { url, permissions }
    );
    return { path: view.pathname };
}

function inputNamed(name: string): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (input === null) throw new Error(`no input named "${name}"`);
    return input;
}

describe('the admin resource list', () => {
    it("calls the list method with the URL's search, sort and page", async () => {
        rpc.list.mockResolvedValue(page([RULE]));

        mount('/plugin/redirects/resources/rules?q=old&sort=from:desc&page=2');

        expect(await screen.findByText('/old')).toBeTruthy();
        expect(rpc.list).toHaveBeenCalledWith({
            search: 'old',
            sort: { from: 'desc' },
            page: 2,
            limit: 20,
        });
    });

    it('shows an option by its label', async () => {
        rpc.list.mockResolvedValue(page([RULE]));

        mount('/plugin/redirects/resources/rules');

        expect(await screen.findByText('Permanent')).toBeTruthy();
    });

    it('opens the new page from the create button', async () => {
        rpc.list.mockResolvedValue(page([RULE]));
        const view = mount('/plugin/redirects/resources/rules');
        await screen.findByText('/old');

        await userEvent.click(screen.getByRole('button', { name: 'New Rule' }));
        await waitFor(() =>
            expect(view.path()).toBe('/plugin/redirects/resources/rules/new')
        );
    });

    it('deletes every selected row, one call per id', async () => {
        rpc.list.mockResolvedValue(page([RULE, { ...RULE, id: 'r2', from: '/two' }]));
        rpc.remove.mockResolvedValue(null);
        mount('/plugin/redirects/resources/rules');
        await screen.findByText('/old');

        await userEvent.click(screen.getByLabelText('Select all'));
        await userEvent.click(screen.getByRole('button', { name: /Bulk actions/ }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(rpc.remove).toHaveBeenCalledTimes(2));
        expect(rpc.remove).toHaveBeenCalledWith({ id: 'r1' });
        expect(rpc.remove).toHaveBeenCalledWith({ id: 'r2' });
    });

    it('refreshes the list when a bulk delete stops partway', async () => {
        rpc.list.mockResolvedValue(page([RULE, { ...RULE, id: 'r2', from: '/two' }]));
        rpc.remove.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Locked'));
        mount('/plugin/redirects/resources/rules');
        await screen.findByText('/old');
        const listReads = rpc.list.mock.calls.length;

        await userEvent.click(screen.getByLabelText('Select all'));
        await userEvent.click(screen.getByRole('button', { name: /Bulk actions/ }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(rpc.remove).toHaveBeenCalledTimes(2));
        // The first row is gone although the batch failed.
        await waitFor(() =>
            expect(rpc.list.mock.calls.length).toBeGreaterThan(listReads)
        );
    });

    it('hides create and delete from a user without their permission', async () => {
        rpc.list.mockResolvedValue(page([RULE]));
        mount('/plugin/redirects/resources/rules', [READ]);
        const row = (await screen.findByText('/old')).closest('tr');

        expect(screen.queryByRole('button', { name: 'New Rule' })).toBeNull();
        expect(screen.queryByLabelText('Select all')).toBeNull();
        await userEvent.click(
            within(row as HTMLElement).getByRole('button', { name: 'Actions' })
        );
        expect(await screen.findByRole('menuitem', { name: 'Edit' })).toBeTruthy();
        expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
    });

    it('links each row to its edit page when the resource has a get method', async () => {
        rpc.list.mockResolvedValue(page([RULE]));
        mount('/plugin/redirects/resources/rules');

        const link = await screen.findByRole('link', { name: '/old' });
        expect(link.getAttribute('href')).toBe('/plugin/redirects/resources/rules/r1');
    });

    it('leaves rows unlinked without a get method', async () => {
        rpc.listEvents.mockResolvedValue(page([{ id: 'e1', message: 'Booted' }]));
        mount('/plugin/redirects/resources/events');

        expect(await screen.findByText('Booted')).toBeTruthy();
        expect(screen.queryByRole('link')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Actions' })).toBeNull();
    });

    it('shows no search box when the resource declares none', async () => {
        rpc.listEvents.mockResolvedValue(page([{ id: 'e1', message: 'Booted' }]));
        mount('/plugin/redirects/resources/events?q=boot');

        await screen.findByText('Booted');
        expect(screen.queryByRole('searchbox')).toBeNull();
        expect(rpc.listEvents).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });

    it('shows a user without the list permission the forbidden message in place', async () => {
        const view = mount('/plugin/redirects/resources/rules', []);

        expect(
            await screen.findByText("You don't have permission to view this page.")
        ).toBeTruthy();
        expect(view.path()).toBe('/plugin/redirects/resources/rules');
        expect(rpc.list).not.toHaveBeenCalled();
    });

    it('shows not found for a resource the config does not declare', async () => {
        mount('/plugin/redirects/resources/missing');

        expect(await screen.findByText('Page not found')).toBeTruthy();
    });
});

describe('the admin resource new page', () => {
    it('sends the field values as { data }, then opens the new row', async () => {
        rpc.create.mockResolvedValue({ ...RULE, id: 'r9' });
        rpc.get.mockResolvedValue({ ...RULE, id: 'r9' });
        const view = mount('/plugin/redirects/resources/rules/new');
        const eventUser = userEvent.setup();

        await screen.findByRole('button', { name: 'Create' });
        await eventUser.type(inputNamed('from'), '/old');
        await eventUser.type(inputNamed('to'), '/new');
        await eventUser.click(screen.getByRole('button', { name: 'Create' }));

        await waitFor(() =>
            expect(view.path()).toBe('/plugin/redirects/resources/rules/r9')
        );
        expect(rpc.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ from: '/old', to: '/new' }),
        });
    });

    it('puts a 422 field error on the field it names', async () => {
        rpc.create.mockRejectedValue(
            new AstromechApiError({
                id: 'e1',
                code: 'VALIDATION_FAILED',
                message: 'Validation failed',
                status: 422,
                details: { fields: { from: ['Already redirected'] } },
            })
        );
        const view = mount('/plugin/redirects/resources/rules/new');
        const eventUser = userEvent.setup();

        await screen.findByRole('button', { name: 'Create' });
        await eventUser.type(inputNamed('from'), '/old');
        await eventUser.click(screen.getByRole('button', { name: 'Create' }));

        expect(await screen.findByText('Already redirected')).toBeTruthy();
        expect(inputNamed('from').getAttribute('aria-invalid')).toBe('true');
        expect(view.path()).toBe('/plugin/redirects/resources/rules/new');
    });

    it('shows not found for a resource without a create method', async () => {
        mount('/plugin/redirects/resources/hits/new');

        expect(await screen.findByText('Page not found')).toBeTruthy();
    });
});

describe('the admin resource edit page', () => {
    it('loads the row and saves it through the update method', async () => {
        rpc.get.mockResolvedValue(RULE);
        rpc.update.mockResolvedValue({ ...RULE, from: '/older' });
        mount('/plugin/redirects/resources/rules/r1');
        const eventUser = userEvent.setup();

        await waitFor(() => expect(inputNamed('from').value).toBe('/old'));
        expect(rpc.get).toHaveBeenCalledWith({ id: 'r1' });
        await eventUser.type(inputNamed('from'), 'er');
        await eventUser.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(rpc.update).toHaveBeenCalledWith({
                id: 'r1',
                data: { from: '/older', to: '/new', statusCode: '301' },
            })
        );
    });

    it('renders read-only for a user without the update permission', async () => {
        rpc.get.mockResolvedValue(RULE);
        mount('/plugin/redirects/resources/rules/r1', [READ]);

        await waitFor(() => expect(inputNamed('from').value).toBe('/old'));
        expect(inputNamed('from').disabled).toBe(true);
        expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    });

    it('renders read-only for a resource without an update method', async () => {
        rpc.getHit.mockResolvedValue({ id: 'h1', path: '/a' });
        mount('/plugin/redirects/resources/hits/h1');

        await waitFor(() => expect(inputNamed('path').value).toBe('/a'));
        expect(inputNamed('path').disabled).toBe(true);
        expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });

    it('deletes the row after asking, then returns to the list', async () => {
        rpc.get.mockResolvedValue(RULE);
        rpc.remove.mockResolvedValue(null);
        rpc.list.mockResolvedValue(page([]));
        const view = mount('/plugin/redirects/resources/rules/r1');

        await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
        expect(await screen.findByText('Delete Rule?')).toBeTruthy();
        expect(rpc.remove).not.toHaveBeenCalled();
        const dialog = screen.getByRole('alertdialog');
        await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

        await waitFor(() =>
            expect(view.path()).toBe('/plugin/redirects/resources/rules')
        );
        expect(rpc.remove).toHaveBeenCalledWith({ id: 'r1' });
    });

    it('shows not found when the get method finds no row', async () => {
        rpc.get.mockResolvedValue(null);
        mount('/plugin/redirects/resources/rules/r404');

        expect(await screen.findByText('Page not found')).toBeTruthy();
    });
});
