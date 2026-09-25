/**
 * @vitest-environment happy-dom
 *
 * The users list keeps its search, sort and page in the URL: the URL drives
 * the query, a sort by name writes the URL, each row links to its user, and
 * a delete asks before it calls the server.
 */

import type { AuthUser } from '@/admin/context/auth';
import type { QueryResult, User } from '@/types/index';
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
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import { ToastProvider } from '@/admin/components/ui/toast';
import { validateListSearch } from '@/admin/components/ui/use-list-state';
import { UsersListPage } from '@/admin/components/users/users-list-page';
import { AiContextProvider } from '@/admin/context/ai-context';
import { AuthProvider, sessionQueryOptions } from '@/admin/context/auth';
import en from '@/admin/locales/en.json';

const { query, remove } = vi.hoisted(() => ({ query: vi.fn(), remove: vi.fn() }));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: {
            ...real.astromechUntypedClient,
            users: { query, delete: remove },
        },
    };
});

function makeUser(id: string, name: string): User {
    return {
        id,
        email: `${id}@example.com`,
        name,
        emailVerified: true,
        image: null,
        locale: 'en',
        locales: ['en'],
        fields: {},
        role: 'editor',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
    };
}

const PAGE: QueryResult<User> = {
    data: [makeUser('u1', 'Ada Lovelace'), makeUser('u2', 'Grace Hopper')],
    pagination: { page: 1, pages: 1, total: 2, limit: 20 },
};

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
});

afterEach(() => {
    query.mockReset();
    remove.mockReset();
});

/** Mount the list at `url` under a real router, and return the router. */
function mountList(url: string) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    });
    queryClient.setQueryData<AuthUser>(sessionQueryOptions.queryKey, {
        id: 'admin',
        name: 'Admin',
        email: 'admin@astromech.dev',
        image: null,
        role: 'admin',
        permissions: ['*'],
    });

    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const listRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/users',
        validateSearch: validateListSearch,
        component: UsersListPage,
    });
    const editRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/users/$id',
        component: () => <p>User page</p>,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([listRoute, editRoute]),
        history: createMemoryHistory({ initialEntries: [url] }),
    });

    render(
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <AuthProvider>
                    <ConfirmProvider>
                        <AiContextProvider>
                            <RouterProvider router={router} />
                        </AiContextProvider>
                    </ConfirmProvider>
                </AuthProvider>
            </ToastProvider>
        </QueryClientProvider>
    );
    return router;
}

describe('the users list', () => {
    it('queries with the search, sort and page the URL holds', async () => {
        query.mockResolvedValue(PAGE);

        mountList('/users?q=ada&sort=email:desc&page=2');

        expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
        expect(query).toHaveBeenCalledWith({
            search: 'ada',
            sort: { email: 'desc' },
            page: 2,
            limit: 20,
        });
    });

    it('writes a sort by name to the URL', async () => {
        query.mockResolvedValue(PAGE);
        const router = mountList('/users?page=2');
        await screen.findByText('Ada Lovelace');

        await userEvent.click(screen.getByRole('button', { name: /Name/ }));

        await waitFor(() =>
            expect(router.state.location.search).toEqual({ sort: 'name:asc' })
        );
    });

    it('links each row to its user', async () => {
        query.mockResolvedValue(PAGE);
        const router = mountList('/users');

        const link = await screen.findByRole('link', { name: 'Grace Hopper' });
        expect(link.getAttribute('href')).toBe('/users/u2');
        await userEvent.click(screen.getByText('u2@example.com'));

        await waitFor(() => expect(router.state.location.pathname).toBe('/users/u2'));
    });

    it('asks before deleting a user, then deletes it', async () => {
        query.mockResolvedValue(PAGE);
        remove.mockResolvedValue(undefined);
        mountList('/users');
        const row = (await screen.findByText('Ada Lovelace')).closest('tr');

        await userEvent.click(
            within(row as HTMLElement).getByRole('button', { name: 'Actions' })
        );
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        expect(await screen.findByText('Delete user?')).toBeTruthy();
        expect(remove).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(remove).toHaveBeenCalledWith({ id: 'u1' }));
    });

    it('shows the empty state when there are no users', async () => {
        query.mockResolvedValue({ data: [], pagination: null });

        mountList('/users');

        expect(await screen.findByText('No users found')).toBeTruthy();
    });
});
