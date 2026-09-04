/**
 * @vitest-environment happy-dom
 *
 * The global edit page. A global is declared by config and its row is created
 * on demand, so a `null` read is an empty form whose first save is the write
 * that creates it. Status lives on `publish`/`unpublish`/`schedule` rather than
 * on `update`, and a locale with no row is opened, not written.
 */

import type { GlobalsBinding } from '@/admin/components/globals/binding';
import type { AuthUser } from '@/admin/context/auth';
import type { AdminGlobal, Global, GlobalsService } from '@/types/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
    useSearch,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GlobalEditPage } from '@/admin/components/globals/global-edit-page';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import { ToastProvider } from '@/admin/components/ui/toast';
import { AiContextProvider } from '@/admin/context/ai-context';
import { AuthProvider, sessionQueryOptions } from '@/admin/context/auth';
import '@/admin/rendering/register-fields';

// The shim declares one locale; the switcher needs two to have anywhere to go.
vi.mock('virtual:astromech/admin-config', () => ({
    default: { defaultLocale: 'en', locales: ['en', 'fr'] },
}));

const KEY = 'site';
const BASE_PATH = `/globals/${KEY}`;

afterEach(cleanup);

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: {} } },
    });
});

function config(overrides: Partial<AdminGlobal> = {}): AdminGlobal {
    return {
        label: 'Site',
        fields: {
            main: [{ name: 'tagline', type: 'text', label: 'Tagline' }],
            sidebar: [],
        },
        capabilities: {
            statuses: true,
            translatable: false,
            versioning: false,
            staging: false,
        },
        public: false,
        nav: true,
        ...overrides,
    } as AdminGlobal;
}

function makeGlobal(overrides: Partial<Global> = {}): Global {
    return {
        id: 'g1',
        key: KEY,
        locale: 'en',
        locales: ['en'],
        fields: { tagline: 'Stored tagline' },
        status: 'unpublished',
        staged: false,
        publishedAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        ...overrides,
    } as Global;
}

/** A stub globals client, recording every call the page makes. */
function makeApi(rows: {
    canonical?: Global | null;
    staged?: Global | null;
    versions?: never[];
}) {
    const get = vi.fn(async () => rows.canonical ?? null);
    const update = vi.fn(
        async (_params: {
            key: string;
            locale?: string;
            staged?: boolean;
            data: { fields: unknown };
        }) => makeGlobal({ fields: { tagline: 'Saved' } })
    );
    const publish = vi.fn(async (_params: { key: string; locale?: string }) =>
        makeGlobal({ status: 'published' })
    );
    const unpublish = vi.fn(async (_params: { key: string; locale?: string }) =>
        makeGlobal({ status: 'unpublished' })
    );
    const schedule = vi.fn(
        async (_params: { key: string; locale?: string; publishedAt: Date }) =>
            makeGlobal({ status: 'scheduled' })
    );
    const getStaged = vi.fn(async () => rows.staged ?? null);
    const mergeStaged = vi.fn(async () => makeGlobal());
    const deleteStaged = vi.fn(async () => undefined);
    const createStaged = vi.fn(async () => makeGlobal({ staged: true }));
    const versions = vi.fn(async () => []);
    const api = {
        get,
        update,
        publish,
        unpublish,
        schedule,
        getStaged,
        mergeStaged,
        deleteStaged,
        createStaged,
        versions,
    } as unknown as GlobalsService;
    return {
        api,
        get,
        update,
        publish,
        unpublish,
        schedule,
        getStaged,
        mergeStaged,
        deleteStaged,
        createStaged,
    };
}

function makeClient(permissions: string[]): QueryClient {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    });
    queryClient.setQueryData<AuthUser>(sessionQueryOptions.queryKey, {
        id: 'u1',
        name: 'Admin',
        email: 'admin@astromech.dev',
        image: null,
        role: 'admin',
        permissions,
    });
    return queryClient;
}

function mountPage(options: {
    api: GlobalsService;
    config: AdminGlobal;
    permissions?: string[];
    initialUrl?: string;
}) {
    const binding: GlobalsBinding = {
        api: options.api,
        key: KEY,
        cacheScope: '',
        config: options.config,
        basePath: BASE_PATH,
        permissionFor: (action) => `global:${KEY}:${action}`,
    };

    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const editRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: BASE_PATH,
        validateSearch: (search: Record<string, unknown>) => ({
            locale: search['locale'] as string | undefined,
            staged: search['staged'] === true || search['staged'] === 'true',
        }),
        component: function EditRoute() {
            const search = useSearch({ strict: false }) as {
                locale?: string;
                staged?: boolean;
            };
            return (
                <GlobalEditPage
                    binding={binding}
                    locale={search.locale}
                    staged={search.staged ?? false}
                />
            );
        },
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([editRoute]),
        history: createMemoryHistory({
            initialEntries: [options.initialUrl ?? `${BASE_PATH}?locale=en`],
        }),
    });

    render(
        <QueryClientProvider client={makeClient(options.permissions ?? ['*'])}>
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

    return router as unknown as { state: { location: { href: string } } };
}

async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

function control(selector: string): HTMLInputElement {
    const el = document.querySelector<HTMLInputElement>(selector);
    if (el === null) throw new Error(`no ${selector}`);
    return el;
}

/** Click a button in the page header (not the confirm dialog's footer). */
async function clickHeaderButton(label: string): Promise<void> {
    const user = userEvent.setup({ delay: null });
    const button = [...document.querySelectorAll('.am-page-header button')].find(
        (el) => el.textContent === label
    );
    if (button === undefined) throw new Error(`no header button "${label}"`);
    await user.click(button);
}

/** Confirm the open `useConfirm` dialog. */
async function confirmDialog(): Promise<void> {
    const user = userEvent.setup({ delay: null });
    const footer = await waitFor(() => {
        const found = document.querySelector('.am-modal-footer');
        if (found === null) throw new Error('no confirm dialog');
        return found;
    });
    const buttons = [...footer.querySelectorAll('button')];
    const confirmButton = buttons[buttons.length - 1];
    if (confirmButton === undefined) throw new Error('the dialog has no confirm button');
    await user.click(confirmButton);
}

/** Open a Select's listbox and pick the option with this label. */
async function pickOption(triggerIndex: number, label: string): Promise<void> {
    const user = userEvent.setup();
    const triggers = [...document.querySelectorAll('[role="combobox"]')];
    const trigger = triggers[triggerIndex];
    if (trigger === undefined) throw new Error(`no combobox at ${triggerIndex}`);
    await user.click(trigger);
    const option = [...document.querySelectorAll('[role="option"]')].find(
        (item) => item.textContent === label
    );
    if (option === undefined) {
        throw new Error(
            `no "${label}" option; rendered: ${[
                ...document.querySelectorAll('[role="option"]'),
            ]
                .map((item) => item.textContent)
                .join(', ')}`
        );
    }
    await user.click(option);
}

describe('the global edit page', () => {
    it('renders an empty form for a global that has never been saved', async () => {
        const { api } = makeApi({ canonical: null });
        mountPage({ api, config: config() });
        await settle();
        await settle();

        await waitFor(() => {
            expect(control('input[name="tagline"]').value).toBe('');
        });
        // Nothing saved means nothing to badge.
        expect(document.querySelector('.am-badge')).toBeNull();
    });

    it('saves through `update` with the fields alone', async () => {
        const user = userEvent.setup({ delay: null });
        const { api, update } = makeApi({ canonical: makeGlobal() });
        mountPage({ api, config: config() });
        await settle();
        await settle();

        const field = await waitFor(() => control('input[name="tagline"]'));
        await user.clear(field);
        await user.type(field, 'A new tagline');
        await user.click(await screen.findByRole('button', { name: 'common.update' }));
        await settle();

        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0]?.[0]).toEqual({
            key: KEY,
            locale: 'en',
            staged: false,
            data: { fields: { tagline: 'A new tagline' } },
        });
    });

    it('follows the save with `publish` when the panel moved the status', async () => {
        const user = userEvent.setup({ delay: null });
        const { api, update, publish } = makeApi({ canonical: makeGlobal() });
        mountPage({ api, config: config() });
        await settle();
        await settle();

        await waitFor(() => control('input[name="tagline"]'));
        // The publish panel's status select is the only combobox on the page.
        await pickOption(0, 'entries.published');
        await user.click(await screen.findByRole('button', { name: 'common.update' }));
        await settle();

        expect(update).toHaveBeenCalledTimes(1);
        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish.mock.calls[0]?.[0]).toEqual({ key: KEY, locale: 'en' });
    });

    it('shows no locale switcher on a global that is not translatable', async () => {
        const { api } = makeApi({ canonical: makeGlobal() });
        mountPage({ api, config: config() });
        await settle();
        await settle();

        await waitFor(() => control('input[name="tagline"]'));
        // Only the publish panel's status select.
        expect(document.querySelectorAll('[role="combobox"]').length).toBe(1);
    });

    it('opens a missing locale instead of writing it', async () => {
        const { api, update } = makeApi({
            canonical: makeGlobal({ locales: ['en'] }),
        });
        const router = mountPage({
            api,
            config: config({
                capabilities: {
                    statuses: false,
                    translatable: true,
                    versioning: false,
                    staging: false,
                },
            }),
        });
        await settle();
        await settle();

        await waitFor(() => control('input[name="tagline"]'));
        // Statuses are off here, so the switcher is the only combobox.
        await pickOption(0, 'Add FR');

        await waitFor(() => {
            expect(router.state.location.href).toBe(`${BASE_PATH}?locale=fr`);
        });
        // The row is written by the first save in that locale, not by the switch.
        expect(update).not.toHaveBeenCalled();
    });

    it('is read-only without the update permission', async () => {
        const { api } = makeApi({ canonical: makeGlobal() });
        mountPage({
            api,
            config: config(),
            permissions: [`global:${KEY}:read`],
        });
        await settle();
        await settle();

        await waitFor(() => control('input[name="tagline"]'));
        expect(screen.queryByRole('button', { name: 'common.update' })).toBeNull();
        expect(document.querySelector('.am-banner-info')?.textContent).toBe(
            'permissions.readOnly'
        );
    });

    /** The staged view of a staging-capable global, with a staged row present. */
    async function mountStaged() {
        const staged = makeGlobal({ staged: true, fields: { tagline: 'Staged' } });
        const handles = makeApi({ canonical: makeGlobal(), staged });
        mountPage({
            api: handles.api,
            config: config({
                capabilities: {
                    statuses: true,
                    translatable: false,
                    versioning: false,
                    staging: true,
                },
            }),
            initialUrl: `${BASE_PATH}?locale=en&staged=true`,
        });
        await settle();
        await settle();
        await waitFor(() => {
            expect(control('input[name="tagline"]').value).toBe('Staged');
        });
        return handles;
    }

    it('merges the staged change from the staged view', async () => {
        const { mergeStaged } = await mountStaged();

        await clickHeaderButton('staging.merge');
        await confirmDialog();
        await settle();

        expect(mergeStaged).toHaveBeenCalledWith({ key: KEY, locale: 'en' });
    });

    it('saves the staged row itself, not the canonical one', async () => {
        const user = userEvent.setup({ delay: null });
        const { update } = await mountStaged();

        const field = control('input[name="tagline"]');
        await user.clear(field);
        await user.type(field, 'Staged edit');
        await clickHeaderButton('common.update');
        await settle();

        expect(update.mock.calls[0]?.[0]).toEqual({
            key: KEY,
            locale: 'en',
            staged: true,
            data: { fields: { tagline: 'Staged edit' } },
        });
    });

    it('discards the staged change from the staged view', async () => {
        const { deleteStaged } = await mountStaged();

        await clickHeaderButton('staging.discard');
        await confirmDialog();
        await settle();

        expect(deleteStaged).toHaveBeenCalledWith({ key: KEY, locale: 'en' });
    });
});
