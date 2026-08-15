/**
 * @vitest-environment happy-dom
 *
 * A save on the entry edit page must write through to the query cache.
 *
 * `useEntryForm`'s save/publish `onSuccess` calls `form.reset(form.state.values)`,
 * which drops `isTouched` back to `false`. `@tanstack/react-form`'s `useForm`
 * copies `options.defaultValues` into `state.values` on every render when they
 * differ from the previous options and the form isn't touched — and
 * `entry-edit-page.tsx` rebuilds `defaultValues` fresh from `useEntry(...)`'s
 * cached entry on every render. If nothing seeds that cache with the saved
 * entry, the next render (which the mutation settling itself triggers) copies
 * the STALE cached entry back over the just-saved values.
 *
 * This mounts the REAL `EntryEditPage` — not a hand-built stand-in — inside a
 * real `@tanstack/react-router` router (memory history) so `useNavigate` and
 * `Link` resolve, plus the plain-React-context providers the page's hooks
 * need (`ToastProvider`, `AuthProvider`, `ConfirmProvider`, `AIContextProvider`).
 * It deliberately skips the app's `_protected` layout/`AppShell` — that's nav
 * chrome unrelated to this bug — and builds an `EntriesMount` by hand rather
 * than going through a route loader, exactly as `entry-edit-cache-invalidation`
 * needs: a save must survive whatever the real page's `onSuccess` does, not
 * whatever this test's own copy of it does.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    Outlet,
    RouterProvider,
    createMemoryHistory,
    createRoute,
    createRootRoute,
    createRouter,
} from '@tanstack/react-router';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ToastProvider } from '@/admin/components/ui/toast';
import { AuthProvider } from '@/admin/context/auth';
import { sessionQueryOptions } from '@/admin/context/auth';
import type { AuthUser } from '@/admin/context/auth';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import { AIContextProvider } from '@/admin/context/ai-context';
import { EntryEditPage } from '@/admin/components/entries/entry-edit-page';
import { scopedEntryKeys } from '@/admin/hooks/use-query-keys';
import '@/admin/rendering/register-fields';
import type { EntriesMount } from '@/admin/components/entries/mount';
import type { AdminEntryType, Entry, EntriesService, EntryStatus } from '@/types/index';

afterEach(cleanup);

beforeAll(async () => {
    // The page reads labels through `useTranslation`; the SPA's own i18n module
    // pulls in virtual modules, so stand up a bare instance instead.
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: {} } },
    });
});

const TYPE = 'caseStudy';
const ID = 'cs1';
const CACHE_SCOPE = '';

function makeEntry(customer: string): Entry {
    return {
        id: ID,
        type: TYPE,
        title: 'A case study',
        status: 'published' as EntryStatus,
        fields: { customer },
    } as unknown as Entry;
}

const ENTRY_TYPE_CONFIG: AdminEntryType = {
    single: 'Case Study',
    plural: 'Case Studies',
    versioning: false,
    translatable: false,
    slug: null,
    adminColumns: [],
    fields: {
        main: [{ name: 'customer', type: 'text', label: 'Customer' }],
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

/**
 * Mounts the real `EntryEditPage` inside a real router + the provider stack
 * its hooks need, skipping only the `_protected` layout's nav chrome.
 */
function mountEditPage(queryClient: QueryClient) {
    const update = vi.fn(async (params: { data: { fields?: Record<string, unknown> } }) =>
        makeEntry((params.data.fields?.['customer'] as string) ?? '')
    );
    const api = {
        get: vi.fn(
            async () =>
                queryClient.getQueryData(scopedEntryKeys(CACHE_SCOPE).get(TYPE, ID)) ??
                null
        ),
        update,
    } as unknown as EntriesService;

    const mount: EntriesMount = {
        api,
        type: TYPE,
        cacheScope: CACHE_SCOPE,
        config: ENTRY_TYPE_CONFIG,
        basePath: `/entries/${TYPE}`,
        permissionFor: (action) => `entry:${TYPE}:${action}`,
    };

    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const editRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => <EntryEditPage mount={mount} id={ID} />,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([editRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
    });

    render(
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <AuthProvider>
                    <ConfirmProvider>
                        <AIContextProvider>
                            <RouterProvider router={router} />
                        </AIContextProvider>
                    </ConfirmProvider>
                </AuthProvider>
            </ToastProvider>
        </QueryClientProvider>
    );

    return { update };
}

/** Let a submit (and the mutation it fires) settle. */
async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

describe('the entry edit page after a save', () => {
    it('keeps displaying the just-saved value, not the stale cached one', async () => {
        const user = userEvent.setup();
        // The admin app's real staleTime (admin/main.tsx) — nothing refetches
        // this query on its own in the observation window.
        const queryClient = new QueryClient({
            defaultOptions: { queries: { staleTime: 30_000 } },
        });
        queryClient.setQueryData(
            scopedEntryKeys(CACHE_SCOPE).get(TYPE, ID),
            makeEntry('Lumenflow')
        );
        // Session, so `usePermissions()` grants the update action without a
        // network round trip — the session query shares the same staleTime.
        // The type argument is explicit because `setQueryData` wraps its value
        // parameter in `NoInfer`, so the shape has to come from the key or from
        // here — an object literal alone can no longer drive the inference.
        queryClient.setQueryData<AuthUser>(sessionQueryOptions.queryKey, {
            id: 'u1',
            name: 'Admin',
            email: 'admin@astromech.dev',
            image: null,
            roleSlug: 'admin',
            permissions: ['*'],
        });

        const page = mountEditPage(queryClient);

        const input = (await screen.findByDisplayValue('Lumenflow')) as HTMLInputElement;
        expect(input.name).toBe('customer');

        // First edit + save, via the real Update button.
        await user.clear(input);
        await user.type(input, 'Lumenflow International');
        const updateButton = await screen.findByRole('button', { name: 'common.update' });
        await user.click(updateButton);
        await settle();

        expect(page.update).toHaveBeenCalledTimes(1);
        expect(input.value).toBe('Lumenflow International');

        // A second render tick — the same kind `form.reset` triggers — must
        // not copy a stale cached value back over the display.
        await settle();
        expect(input.value).toBe('Lumenflow International');

        // Second edit + save: this is the case the live bug regressed on —
        // the display went back to the ORIGINAL value, not the prior save.
        await user.clear(input);
        await user.type(input, 'Zephyr Labs');
        await user.click(updateButton);
        await settle();

        expect(page.update).toHaveBeenCalledTimes(2);
        expect(input.value).toBe('Zephyr Labs');

        await settle();
        expect(input.value).toBe('Zephyr Labs');
    });
});
