/**
 * @vitest-environment happy-dom
 *
 * The entries list keeps its filter, sort and page in the URL through
 * `useListController`: the URL drives the query, and a sort writes the URL
 * and returns to the first page. An id the config does not declare renders
 * the not-found page.
 */

import type { AuthUser } from '@/admin/context/auth';
import type { AdminEntryType, Entry, QueryResult, User } from '@/types/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EntriesListPage } from '@/admin/components/entries/entries-list-page';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import { ToastProvider } from '@/admin/components/ui/toast';
import { AiContextProvider } from '@/admin/context/ai-context';
import { AuthProvider, sessionQueryOptions } from '@/admin/context/auth';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import en from '@/admin/locales/en.json';
import { validateEntriesListSearch } from '@/admin/utilities/entry-admin-path';
import '@/admin/rendering/cells/register-cells';

const { query, adminConfig } = vi.hoisted(() => ({
    query: vi.fn(),
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en'],
        entryTypes: {} as Record<string, unknown>,
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: { ...real.astromechUntypedClient, entries: { query } },
    };
});

const POST: AdminEntryType = {
    single: 'Post',
    plural: 'Posts',
    versioning: false,
    translatable: false,
    slug: null,
    adminColumns: [],
    fields: { main: [], sidebar: [] },
    url: null,
    capabilities: {
        statuses: true,
        slug: false,
        translatable: false,
        versioning: false,
        staging: false,
        trash: true,
    },
    titleField: 'title',
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
    adminConfig.entryTypes = {};
});

function makeEntry(id: string, title: string): Entry {
    return {
        id,
        type: 'post',
        locale: 'en',
        locales: ['en'],
        title,
        status: 'published',
        fields: {},
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
    } as unknown as Entry;
}

/** Mount the page at `url` under a real router, and return the router. */
function mountList(url: string, type = 'post') {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    });
    queryClient.setQueryData<AuthUser>(sessionQueryOptions.queryKey, {
        id: 'u1',
        name: 'Admin',
        email: 'admin@astromech.dev',
        image: null,
        role: 'admin',
        permissions: ['*'],
    });
    queryClient.setQueryData<QueryResult<User>>(queryKeys.users.list({ limit: 'all' }), {
        data: [],
        pagination: null,
    });

    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const listRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/entries/$type',
        validateSearch: validateEntriesListSearch,
        component: () => <EntriesListPage type={type} />,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([listRoute]),
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

describe('the entries list', () => {
    it('queries with the filter and page the URL holds', async () => {
        adminConfig.entryTypes = { post: POST };
        query.mockResolvedValue({
            data: [makeEntry('e1', 'Hello')],
            pagination: { page: 2, pages: 3, total: 41, limit: 20 },
        });

        mountList('/entries/post?status=published&page=2&q=hel');

        expect(await screen.findByText('Hello')).toBeTruthy();
        expect(query).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'post',
                where: { status: 'published' },
                page: 2,
                search: 'hel',
            })
        );
    });

    it('writes a sort to the URL and returns to the first page', async () => {
        adminConfig.entryTypes = { post: POST };
        query.mockResolvedValue({
            data: [makeEntry('e1', 'Hello')],
            pagination: { page: 2, pages: 3, total: 41, limit: 20 },
        });
        const router = mountList('/entries/post?page=2');
        await screen.findByText('Hello');

        await userEvent.click(screen.getByRole('button', { name: /Title/ }));

        await waitFor(() =>
            expect(router.state.location.search).toEqual({ sort: 'title:asc' })
        );
    });

    it('renders the not-found page for a type the config does not declare', async () => {
        mountList('/entries/missing', 'missing');

        expect(await screen.findByText('/entries/missing')).toBeTruthy();
        expect(query).not.toHaveBeenCalled();
    });
});
