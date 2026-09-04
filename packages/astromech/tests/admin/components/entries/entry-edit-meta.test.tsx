/**
 * @vitest-environment happy-dom
 *
 * The entry edit page's metadata line names who last wrote the locale and who
 * made the entry, and drops the author when the id resolves to no known user.
 */

import type { EntriesMount } from '@/admin/components/entries/mount';
import type { AuthUser } from '@/admin/context/auth';
import type { AdminEntryType, EntriesService, Entry, EntryStatus } from '@/types/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
    useParams,
} from '@tanstack/react-router';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EntryEditPage } from '@/admin/components/entries/entry-edit-page';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import { ToastProvider } from '@/admin/components/ui/toast';
import { AiContextProvider } from '@/admin/context/ai-context';
import { AuthProvider, sessionQueryOptions } from '@/admin/context/auth';
import en from '@/admin/locales/en.json';
import '@/admin/rendering/register-fields';

vi.mock('virtual:astromech/admin-config', () => ({
    default: { defaultLocale: 'en', locales: ['en'] },
}));

const { queryUsers } = vi.hoisted(() => ({ queryUsers: vi.fn() }));

vi.mock('@/transport/http/client', () => ({
    astromechClient: { users: { query: queryUsers } },
}));

afterEach(() => {
    cleanup();
    queryUsers.mockReset();
});

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
});

const TYPE = 'caseStudy';
const ID = 'cs1';

const ENTRY_TYPE_CONFIG: AdminEntryType = {
    single: 'Case Study',
    plural: 'Case Studies',
    versioning: false,
    translatable: false,
    slug: null,
    adminColumns: [],
    fields: {
        main: [{ name: 'excerpt', type: 'textarea', label: 'Excerpt' }],
        sidebar: [],
    },
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

function makeEntry(overrides: Partial<Entry>): Entry {
    return {
        id: ID,
        type: TYPE,
        locale: 'en',
        title: 'A case study',
        status: 'published' as EntryStatus,
        locales: ['en'],
        fields: { excerpt: 'An excerpt' },
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-02-02T00:00:00Z'),
        ...overrides,
    } as unknown as Entry;
}

function mountPage(entry: Entry): void {
    const api = {
        get: vi.fn(async () => entry),
        update: vi.fn(),
    } as unknown as EntriesService;
    const mount: EntriesMount = {
        api,
        type: TYPE,
        cacheScope: '',
        config: ENTRY_TYPE_CONFIG,
        basePath: `/entries/${TYPE}`,
        permissionFor: (action) => `entry:${TYPE}:${action}`,
    };

    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const editRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/entries/$type/$id',
        component: function EditRoute() {
            const params = useParams({ strict: false }) as { id: string };
            return <EntryEditPage mount={mount} id={params.id} locale="en" />;
        },
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([editRoute]),
        history: createMemoryHistory({ initialEntries: [`/entries/${TYPE}/${ID}`] }),
    });

    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData<AuthUser>(sessionQueryOptions.queryKey, {
        id: 'u1',
        name: 'Admin',
        email: 'admin@astromech.dev',
        image: null,
        role: 'admin',
        permissions: ['*'],
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
}

async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

/** The rendered metadata line, once the entry and the users have loaded. */
async function findMetaLine(): Promise<string> {
    return waitFor(() => {
        const line = document.querySelector('.am-entry-meta');
        if (line === null) throw new Error('no metadata line');
        return line.textContent ?? '';
    });
}

describe('the entry edit page metadata line', () => {
    it('names the author of the last write and of the entry', async () => {
        queryUsers.mockResolvedValue({
            data: [
                { id: 'a1', name: 'Ada', email: 'ada@example.com' },
                { id: 'g1', name: 'Grace', email: 'grace@example.com' },
            ],
        });
        mountPage(makeEntry({ createdBy: 'g1', updatedBy: 'a1' }));
        await settle();

        await waitFor(async () => {
            const line = await findMetaLine();
            expect(line).toContain('by Ada');
            expect(line).toContain('by Grace');
        });
    });

    it('drops the author when the id names no known user', async () => {
        queryUsers.mockResolvedValue({
            data: [{ id: 'g1', name: 'Grace', email: 'grace@example.com' }],
        });
        mountPage(makeEntry({ createdBy: 'g1', updatedBy: 'gone' }));
        await settle();

        await waitFor(async () => {
            const [updated, created] = (await findMetaLine()).split(' · ');
            expect(created).toContain('by Grace');
            expect(updated).toMatch(/^Updated /);
            expect(updated).not.toContain(' by ');
        });
    });
});
