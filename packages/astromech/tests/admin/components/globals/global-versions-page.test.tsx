/**
 * @vitest-environment happy-dom
 *
 * The global version history page. A version snapshots one locale's content
 * row, so the list is that locale's history newest first, and restoring names
 * the global by key and locale — never by a row id.
 */

import type { GlobalsMount } from '@/admin/components/globals/mount';
import type { AuthUser } from '@/admin/context/auth';
import type { AdminGlobal, GlobalsService, GlobalVersion } from '@/types/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GlobalVersionsPage } from '@/admin/components/globals/global-versions-page';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import { ToastProvider } from '@/admin/components/ui/toast';
import { AuthProvider, sessionQueryOptions } from '@/admin/context/auth';

const KEY = 'site';
const BASE_PATH = `/globals/${KEY}`;

afterEach(cleanup);

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: {} } },
    });
});

const CONFIG = {
    label: 'Site',
    fields: { main: [], sidebar: [] },
    capabilities: {
        statuses: true,
        translatable: false,
        versioning: true,
        staging: false,
    },
    public: false,
    nav: true,
} as AdminGlobal;

function version(n: number): GlobalVersion {
    return {
        id: `v${n}`,
        key: KEY,
        locale: 'en',
        version: n,
        fields: { tagline: `Tagline ${n}` },
        status: 'unpublished',
        createdAt: new Date(`2026-0${n}-01T00:00:00Z`),
        createdBy: null,
    };
}

function mountPage() {
    const restoreVersion = vi.fn(async () => version(3));
    const api = {
        versions: vi.fn(async () => [version(1), version(2), version(3)]),
        restoreVersion,
        get: vi.fn(async () => null),
    } as unknown as GlobalsService;

    const mount: GlobalsMount = {
        api,
        key: KEY,
        cacheScope: '',
        config: CONFIG,
        basePath: BASE_PATH,
        permissionFor: (action) => `global:${KEY}:${action}`,
    };

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

    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const versionsRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: `${BASE_PATH}/versions`,
        component: () => <GlobalVersionsPage mount={mount} locale="en" />,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([versionsRoute]),
        history: createMemoryHistory({ initialEntries: [`${BASE_PATH}/versions`] }),
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

    return { restoreVersion };
}

async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

describe('the global versions page', () => {
    it('lists the locale’s versions newest first', async () => {
        mountPage();
        await settle();
        await settle();

        const numbers = await waitFor(() => {
            const found = [...document.querySelectorAll('.am-versions-item-number')].map(
                (el) => el.textContent
            );
            if (found.length === 0) throw new Error('no versions rendered');
            return found;
        });
        expect(numbers).toEqual(['#3', '#2', '#1']);
    });

    it('restores the selected version by key and locale', async () => {
        const user = userEvent.setup({ delay: null });
        const { restoreVersion } = mountPage();
        await settle();
        await settle();

        const restoreButton = await waitFor(() => {
            const found = [...document.querySelectorAll('button')].find(
                (el) => el.textContent === 'versions.restoreButton'
            );
            if (found === undefined) throw new Error('no restore button');
            return found;
        });
        await user.click(restoreButton);

        // The restore is behind a confirmation.
        const footer = await waitFor(() => {
            const found = document.querySelector('.am-modal-footer');
            if (found === null) throw new Error('no confirm dialog');
            return found;
        });
        const buttons = [...footer.querySelectorAll('button')];
        await user.click(buttons[buttons.length - 1] as HTMLButtonElement);
        await settle();

        expect(restoreVersion).toHaveBeenCalledWith({
            key: KEY,
            locale: 'en',
            // The newest version is selected on load.
            versionId: 'v3',
        });
    });
});
