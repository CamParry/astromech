/**
 * @vitest-environment happy-dom
 *
 * A locale switch on the entry edit page must not damage a `group()` value.
 *
 * `LocaleSwitcher` changes the `locale` SEARCH PARAM and keeps the id, so the
 * route component stays mounted while `EntryEditPage` swaps the row under it.
 * A group's object value is atomic — a sub-key dropped anywhere along the way
 * is a sub-key dropped in the saved entry.
 *
 * This mounts the REAL `EntryEditPage` behind a memory router (the shape
 * `entry-edit-cache-invalidation.test.tsx` established) and subscribes to the
 * page's own `form.store`, so a partial group is caught at the transition that
 * writes it rather than only at submit.
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
    useParams,
    useSearch,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryEditPage } from '@/admin/components/entries/entry-edit-page';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import { ToastProvider } from '@/admin/components/ui/toast';
import { AiContextProvider } from '@/admin/context/ai-context';
import { AuthProvider, sessionQueryOptions } from '@/admin/context/auth';
import '@/admin/rendering/register-fields';
import type { EntriesMount } from '@/admin/components/entries/mount';
import type * as UseEntryForm from '@/admin/hooks/use-entry-form';
import type { AdminEntryType, EntriesService, Entry, EntryStatus } from '@/types/index';

// The shim declares one locale; the switcher needs two to have anywhere to go.
vi.mock('virtual:astromech/admin-config', () => ({
    default: { defaultLocale: 'en', locales: ['en', 'fr'] },
}));

/** Every distinct `values.fields` the page's form passed through. */
const transitions: unknown[] = [];
const subscribed = new WeakSet<object>();

vi.mock('@/admin/hooks/use-entry-form', async (importOriginal) => {
    const actual = await importOriginal<typeof UseEntryForm>();
    return {
        ...actual,
        useEntryForm: (options: Parameters<typeof UseEntryForm.useEntryForm>[0]) => {
            const result = actual.useEntryForm(options);
            const store = result.form.store as unknown as {
                subscribe: (fn: () => void) => () => void;
                state: { values: { fields: unknown } };
            };
            if (!subscribed.has(store)) {
                subscribed.add(store);
                store.subscribe(() => {
                    const fields = structuredClone(store.state.values.fields);
                    const last = transitions.at(-1);
                    if (JSON.stringify(last) === JSON.stringify(fields)) return;
                    transitions.push(fields);
                });
            }
            return result;
        },
    };
});

afterEach(cleanup);
beforeEach(() => {
    transitions.length = 0;
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
// One entry, two locales: the id is the same on both sides of the switch.
const ID = 'cs1';
const LOCALES = ['en', 'fr'];

function makeEntry(locale: string, fields: Record<string, unknown>): Entry {
    return {
        id: ID,
        type: TYPE,
        locale,
        title: locale === 'en' ? 'A case study' : 'Une étude de cas',
        status: 'published' as EntryStatus,
        locales: LOCALES,
        fields,
    } as unknown as Entry;
}

const ENTRY_TYPE_CONFIG: AdminEntryType = {
    single: 'Case Study',
    plural: 'Case Studies',
    versioning: false,
    translatable: true,
    slug: null,
    adminColumns: [],
    fields: {
        main: [
            { name: 'excerpt', type: 'textarea', label: 'Excerpt' },
            // The demo's `seoSection()` shape: an unboxed group of two sub-keys.
            {
                name: 'seo',
                type: 'group',
                boxed: false,
                fields: [
                    { name: 'title', type: 'text', label: 'Meta title' },
                    { name: 'description', type: 'textarea', label: 'Meta description' },
                ],
            },
        ],
        sidebar: [],
    },
    url: null,
    capabilities: {
        statuses: true,
        slug: false,
        translatable: true,
        versioning: false,
        staging: false,
        trash: true,
    },
    titleField: 'title',
};

/** The two locale rows of the one entry the switcher moves between. */
function makeApi() {
    const rows = new Map<string, Entry>([
        [
            'en',
            makeEntry('en', {
                excerpt: 'An excerpt',
                seo: { title: 'EN title', description: 'EN description' },
            }),
        ],
        [
            'fr',
            makeEntry('fr', {
                excerpt: 'Un extrait',
                seo: { title: 'FR title', description: 'FR description' },
            }),
        ],
    ]);
    const update = vi.fn(
        async (params: {
            locale?: string;
            data: { fields?: Record<string, unknown> };
        }) => {
            const locale = params.locale ?? 'en';
            const next = makeEntry(locale, { ...(params.data.fields ?? {}) });
            rows.set(locale, next);
            return next;
        }
    );
    const api = {
        get: vi.fn(
            async (params: { locale?: string }) => rows.get(params.locale ?? 'en') ?? null
        ),
        update,
    } as unknown as EntriesService;
    return { api, update };
}

function mountApp(queryClient: QueryClient, api: EntriesService) {
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
        validateSearch: (search: Record<string, unknown>) => ({
            locale: search['locale'] as string | undefined,
        }),
        component: function EditRoute() {
            const params = useParams({ strict: false }) as { id: string };
            const search = useSearch({ strict: false }) as { locale?: string };
            return <EntryEditPage mount={mount} id={params.id} locale={search.locale} />;
        },
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([editRoute]),
        history: createMemoryHistory({
            initialEntries: [`/entries/${TYPE}/${ID}?locale=en`],
        }),
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

    // `to` is typed against the admin app's generated route tree, which this
    // hand-built tree is not part of; address it by plain string instead.
    return router as unknown as { navigate: (opts: { to: string }) => Promise<void> };
}

async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

function control(selector: string): HTMLInputElement {
    const el = document.querySelector<HTMLInputElement>(selector);
    if (el === null) {
        throw new Error(
            `no ${selector}; rendered: ${[...document.querySelectorAll('input, textarea')]
                .map((e) => e.getAttribute('name'))
                .join(', ')}`
        );
    }
    return el;
}

/** `control`, retried until it exists — the page loads its row asynchronously. */
async function findControl(selector: string): Promise<HTMLInputElement> {
    return waitFor(() => control(selector));
}

function makeClient(): QueryClient {
    // The admin app's real staleTime (admin/main.tsx).
    const queryClient = new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    });
    queryClient.setQueryData<AuthUser>(sessionQueryOptions.queryKey, {
        id: 'u1',
        name: 'Admin',
        email: 'admin@astromech.dev',
        image: null,
        roleSlug: 'admin',
        permissions: ['*'],
    });
    return queryClient;
}

/** Every `seo` the form held either carried both sub-keys or was absent. */
function assertNoPartialGroup(): void {
    let seen = 0;
    for (const fields of transitions) {
        const seo = (fields as { seo?: Record<string, unknown> }).seo;
        if (seo === undefined) continue;
        seen += 1;
        expect(Object.keys(seo).sort()).toEqual(['description', 'title']);
    }
    // A subscription that recorded nothing would pass the loop vacuously.
    expect(seen).toBeGreaterThan(0);
}

describe('the entry edit page across a locale switch', () => {
    it('keeps the whole group when one sub-key is edited either side of the switch', async () => {
        const user = userEvent.setup({ delay: null });
        const queryClient = makeClient();
        const { api, update } = makeApi();
        const router = mountApp(queryClient, api);
        await settle();
        await settle();

        // Edit the meta title alone, leaving the sibling untouched.
        const title = await findControl('input[name="seo.title"]');
        await user.clear(title);
        await user.type(title, 'EN edited');

        // Switch locale — what `LocaleSwitcher.handleValueChange` does for a
        // locale the entry already has: same id, different `locale` param.
        await act(async () => {
            await router.navigate({ to: `/entries/${TYPE}/${ID}?locale=fr` });
        });
        await settle();
        await settle();
        assertNoPartialGroup();

        // Edit on the other locale, then come back.
        const other = await findControl('input[name="seo.title"]');
        await user.clear(other);
        await user.type(other, 'FR edited');
        await act(async () => {
            await router.navigate({ to: `/entries/${TYPE}/${ID}?locale=en` });
        });
        await settle();
        await settle();
        assertNoPartialGroup();

        const back = await findControl('input[name="seo.title"]');
        await user.clear(back);
        await user.type(back, 'EN edited again');
        await user.click(await screen.findByRole('button', { name: 'common.update' }));
        await settle();

        assertNoPartialGroup();
        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0]?.[0]).toMatchObject({
            id: ID,
            locale: 'en',
            data: {
                fields: {
                    excerpt: 'An excerpt',
                    seo: {
                        title: 'EN edited again',
                        // The sub-key nobody touched, all the way to the wire.
                        description: 'EN description',
                    },
                },
            },
        });
    });

    it('loads the sibling locale’s own values when the form is untouched', async () => {
        const queryClient = makeClient();
        const { api } = makeApi();
        const router = mountApp(queryClient, api);
        await settle();
        await settle();

        await waitFor(() => {
            expect(control('input[name="seo.title"]').value).toBe('EN title');
        });

        await act(async () => {
            await router.navigate({ to: `/entries/${TYPE}/${ID}?locale=fr` });
        });
        await settle();
        await settle();

        // The route component is not remounted; the page keys its body on the
        // locale, so the new row arrives through a fresh form.
        await waitFor(() => {
            expect(control('input[name="seo.title"]').value).toBe('FR title');
        });
        assertNoPartialGroup();
    });

    it('loads the sibling locale’s own values when the form has been edited', async () => {
        const user = userEvent.setup({ delay: null });
        const queryClient = makeClient();
        const { api, update } = makeApi();
        const router = mountApp(queryClient, api);
        await settle();
        await settle();

        // Touch the form. From here TanStack Form stops copying `defaultValues`
        // in, so only the remount can show the other locale's row.
        const title = await findControl('input[name="seo.title"]');
        await user.clear(title);
        await user.type(title, 'EN edited');
        await waitFor(() => {
            expect(control('input[name="seo.title"]').value).toBe('EN edited');
        });

        await act(async () => {
            await router.navigate({ to: `/entries/${TYPE}/${ID}?locale=fr` });
        });
        await settle();
        await settle();

        await waitFor(() => {
            expect(control('input[name="seo.title"]').value).toBe('FR title');
            expect(control('textarea[name="excerpt"]').value).toBe('Un extrait');
            expect(control('#entry-title').value).toBe('Une étude de cas');
        });

        // Back to the first locale: its stored values, not the unsaved edit.
        await act(async () => {
            await router.navigate({ to: `/entries/${TYPE}/${ID}?locale=en` });
        });
        await settle();
        await settle();

        await waitFor(() => {
            expect(control('input[name="seo.title"]').value).toBe('EN title');
            expect(control('textarea[name="excerpt"]').value).toBe('An excerpt');
        });
        expect(update).not.toHaveBeenCalled();
        assertNoPartialGroup();
    });
});
