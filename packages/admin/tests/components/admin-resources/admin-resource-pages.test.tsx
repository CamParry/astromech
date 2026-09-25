/**
 * @vitest-environment happy-dom
 *
 * The admin resource pages over the shim's `redirects` plugin: the list calls
 * the list method with the URL's search, sort and page and hides create, open
 * and delete without the method or its permission; the new page sends `{ data }`
 * and puts a 422 on its field; the edit page loads the row, saves it, renders
 * read-only without an update method or its permission, and shows not found.
 */

import type { AuthUser } from '@/admin/context/auth';
import type { AdminResourceRow, QueryResult } from '@/types/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '@/admin/rendering/register-fields';
import { AdminResourceEditPage } from '@/admin/components/admin-resources/admin-resource-edit-page';
import { AdminResourceListPage } from '@/admin/components/admin-resources/admin-resource-list-page';
import { AdminResourceNewPage } from '@/admin/components/admin-resources/admin-resource-new-page';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import { ToastProvider } from '@/admin/components/ui/toast';
import { validateListSearch } from '@/admin/components/ui/use-list-state';
import { AuthProvider, sessionQueryOptions } from '@/admin/context/auth';
import en from '@/admin/locales/en.json';
import { AstromechApiError } from '@/transport/http/client';

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

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
});

afterEach(() => {
    for (const fn of Object.values(rpc)) fn.mockReset();
});

/** Mount the three pages under a real router at `url`, as a user holding `permissions`. */
function mount(url: string, permissions: string[] = [READ, WRITE]) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    });
    queryClient.setQueryData<AuthUser>(sessionQueryOptions.queryKey, {
        id: 'admin',
        name: 'Admin',
        email: 'admin@example.com',
        image: null,
        role: 'editor',
        permissions,
    });

    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const listRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/plugin/$name/resources/$resource',
        validateSearch: validateListSearch,
        component: function ListRoute() {
            const { name, resource } = listRoute.useParams();
            return <AdminResourceListPage plugin={name} name={resource} />;
        },
    });
    const newRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/plugin/$name/resources/$resource/new',
        component: function NewRoute() {
            const { name, resource } = newRoute.useParams();
            return <AdminResourceNewPage plugin={name} name={resource} />;
        },
    });
    const editRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/plugin/$name/resources/$resource/$id',
        component: function EditRoute() {
            const { name, resource, id } = editRoute.useParams();
            return <AdminResourceEditPage plugin={name} name={resource} id={id} />;
        },
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([listRoute, newRoute, editRoute]),
        history: createMemoryHistory({ initialEntries: [url] }),
    });

    render(
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <AuthProvider>
                    <ConfirmProvider>
                        <RouterProvider router={router} />
                    </ConfirmProvider>
                </AuthProvider>
            </ToastProvider>
        </QueryClientProvider>
    );
    return { path: () => router.state.location.pathname };
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

    it('refuses a user without the list permission', async () => {
        mount('/plugin/redirects/resources/rules', []);

        expect(await screen.findByRole('alert')).toBeTruthy();
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
