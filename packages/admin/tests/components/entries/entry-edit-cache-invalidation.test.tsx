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
 * need (`ToastProvider`, `AuthProvider`, `ConfirmProvider`, `AiContextProvider`).
 * It deliberately skips the app's `_protected` layout/`AppShell` — that's nav
 * chrome unrelated to this bug — and declares its entry type in a mocked config rather
 * than going through a route loader, exactly as `entry-edit-cache-invalidation`
 * needs: a save must survive whatever the real page's `onSuccess` does, not
 * whatever this test's own copy of it does.
 */

import type { AuthUser } from '@/admin/context/auth';
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
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EntryEditPage } from '@/admin/components/entries/entry-edit-page';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import { ToastProvider } from '@/admin/components/ui/toast';
import { AiContextProvider } from '@/admin/context/ai-context';
import { AuthProvider, sessionQueryOptions } from '@/admin/context/auth';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import '@/admin/rendering/register-fields';
import type {
    AdminEntryType,
    EntriesService,
    Entry,
    EntryStatus,
    QueryResult,
    User,
} from '@/types/index';

// The page reads its entry type from the config; each mount declares it.
const { adminConfig } = vi.hoisted(() => ({
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en'],
        entryTypes: {} as Record<string, unknown>,
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

// The page calls entries through the client; each test sets the stub.
const client = vi.hoisted(() => ({ entries: undefined as unknown }));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: {
            ...real.astromechUntypedClient,
            get entries() {
                return client.entries;
            },
        },
    };
});

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
const LOCALE = 'en';

function makeEntry(customer: string): Entry {
    return {
        id: ID,
        type: TYPE,
        locale: LOCALE,
        locales: [LOCALE],
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
                queryClient.getQueryData(queryKeys.entries.get(TYPE, ID, LOCALE)) ?? null
        ),
        update,
    } as unknown as EntriesService;

    client.entries = api;
    adminConfig.entryTypes[TYPE] = ENTRY_TYPE_CONFIG;

    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const editRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => <EntryEditPage type={TYPE} id={ID} locale={LOCALE} />,
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
                        <AiContextProvider>
                            <RouterProvider router={router} />
                        </AiContextProvider>
                    </ConfirmProvider>
                </AuthProvider>
            </ToastProvider>
        </QueryClientProvider>
    );

    return { update };
}

/**
 * Wait for the `count`th save to finish: its success toast is up and the Update
 * button has left its loading state, which it does on a render after `onSuccess`.
 */
async function waitForSave(button: HTMLElement, count: number): Promise<void> {
    await waitFor(() => {
        expect(screen.getAllByText('entries.updated')).toHaveLength(count);
        expect(button.querySelector('.am-spinner')).toBeNull();
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
            queryKeys.entries.get(TYPE, ID, LOCALE),
            makeEntry('Lumenflow')
        );
        // Session, so `usePermissions()` grants the update action without a
        // network round trip — the session query shares the same staleTime.
        // The type argument is explicit because `setQueryData` wraps its value
        // parameter in `NoInfer`, so the shape has to come from the key or from
        // here — an object literal alone cannot drive the inference.
        queryClient.setQueryData<AuthUser>(sessionQueryOptions.queryKey, {
            id: 'u1',
            name: 'Admin',
            email: 'admin@astromech.dev',
            image: null,
            role: 'admin',
            permissions: ['*'],
        });
        // No known users, so the page's author names need no request either.
        queryClient.setQueryData<QueryResult<User>>(
            queryKeys.users.list({ limit: 'all' }),
            { data: [], pagination: null }
        );

        const page = mountEditPage(queryClient);

        const input = (await screen.findByDisplayValue('Lumenflow')) as HTMLInputElement;
        expect(input.name).toBe('customer');

        // First edit + save, via the real Update button.
        await user.clear(input);
        await user.type(input, 'Lumenflow International');
        const updateButton = await screen.findByRole('button', { name: 'common.update' });
        await user.click(updateButton);
        await waitForSave(updateButton, 1);

        expect(page.update).toHaveBeenCalledTimes(1);
        // The renders the save triggers, `form.reset`'s among them, have all
        // committed by now, and none may copy the stale cached value back.
        expect(input.value).toBe('Lumenflow International');

        // Second edit + save: this is the case the live bug regressed on —
        // the display went back to the ORIGINAL value, not the prior save.
        await user.clear(input);
        await user.type(input, 'Zephyr Labs');
        await user.click(updateButton);
        await waitForSave(updateButton, 2);

        expect(page.update).toHaveBeenCalledTimes(2);
        expect(input.value).toBe('Zephyr Labs');
    });
});
