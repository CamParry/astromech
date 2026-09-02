/**
 * @vitest-environment happy-dom
 *
 * The sidebar's globals block. A global is listed when it opts into the nav
 * and the signed-in user holds its own read permission — the block is not
 * gated as a whole, so one unreadable global hides only itself.
 */

import type { AuthUser } from '@/admin/context/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRouter,
    RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/admin/components/layout/sidebar';
import { AuthProvider, sessionQueryOptions } from '@/admin/context/auth';
import { UiProvider } from '@/admin/context/ui';

vi.mock('virtual:astromech/admin-config', () => ({
    default: {
        defaultLocale: 'en',
        locales: ['en'],
        entries: {},
        pages: [],
        plugins: [],
        globals: {
            site: { label: 'Site', nav: true },
            footer: { label: 'Footer', nav: true },
            hidden: { label: 'Hidden', nav: false },
        },
    },
}));

afterEach(cleanup);

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: {} } },
    });
});

function mountSidebar(permissions: string[]) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData<AuthUser>(sessionQueryOptions.queryKey, {
        id: 'u1',
        name: 'Editor',
        email: 'editor@astromech.dev',
        image: null,
        roleSlug: 'editor',
        permissions,
    });

    const rootRoute = createRootRoute({ component: () => <Sidebar /> });
    const router = createRouter({
        routeTree: rootRoute,
        history: createMemoryHistory({ initialEntries: ['/'] }),
    });

    render(
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <UiProvider>
                    <RouterProvider router={router} />
                </UiProvider>
            </AuthProvider>
        </QueryClientProvider>
    );
}

function globalLinks(): { label: string; href: string | null }[] {
    const block = document.querySelector('nav[aria-label="nav.globals"]');
    if (block === null) return [];
    return [...block.querySelectorAll('a')].map((a) => ({
        label: a.textContent ?? '',
        href: a.getAttribute('href'),
    }));
}

async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

describe('the sidebar globals block', () => {
    it('lists the nav-visible globals the user may read', async () => {
        mountSidebar(['global:site:read', 'global:footer:read', 'global:hidden:read']);
        await settle();

        expect(globalLinks()).toEqual([
            { label: 'Site', href: '/globals/site' },
            { label: 'Footer', href: '/globals/footer' },
        ]);
    });

    it('drops a global the user cannot read', async () => {
        mountSidebar(['global:site:read']);
        await settle();

        expect(globalLinks().map((link) => link.label)).toEqual(['Site']);
    });

    it('renders no block at all when nothing is readable', async () => {
        mountSidebar(['entry:post:read']);
        await settle();

        expect(document.querySelector('nav[aria-label="nav.globals"]')).toBeNull();
    });
});
