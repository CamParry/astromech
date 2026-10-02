/**
 * @vitest-environment happy-dom
 *
 * The global edit page. A global is declared by config and its row is created
 * on demand, so a `null` read is an empty form whose first save is the write
 * that creates it. One `update` carries the fields and the status the publish
 * panel asks for, a locale with no row is opened, not written, and the merge
 * confirm warns when the staged read reports `diverged`.
 */

import type { RenderAdminResult } from '../../_support/render-admin';
import type { AdminGlobal, Global, GlobalsService } from '@/types/index';
import { useSearch } from '@tanstack/react-router';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GlobalEditPage } from '@/admin/components/globals/global-edit-page';
import { renderAdmin } from '../../_support/render-admin';

// The page calls globals through the client; each test sets the stub.
const client = vi.hoisted(() => ({ globals: undefined as unknown }));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: {
            ...real.astromechUntypedClient,
            get globals() {
                return client.globals;
            },
        },
    };
});

// The shim declares one locale; the switcher needs two to have anywhere to go.
const { adminConfig } = vi.hoisted(() => ({
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en', 'fr'],
        globals: {} as Record<string, unknown>,
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

const KEY = 'site';
const BASE_PATH = `/globals/${KEY}`;

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

/** The page as its route renders it: the search params mapped to props. */
function EditRoute() {
    const search = useSearch({ strict: false }) as { locale?: string; staged?: boolean };
    return (
        <GlobalEditPage
            globalKey={KEY}
            locale={search.locale}
            staged={search.staged ?? false}
        />
    );
}

function mountPage(options: {
    api: GlobalsService;
    config: AdminGlobal;
    permissions?: string[];
    initialUrl?: string;
}): RenderAdminResult {
    client.globals = options.api;
    adminConfig.globals[KEY] = options.config;

    return renderAdmin(<EditRoute />, {
        url: options.initialUrl ?? `${BASE_PATH}?locale=en`,
        permissions: options.permissions ?? ['*'],
    });
}

/** The tagline field's input, once the form has rendered. */
function tagline(): Promise<HTMLInputElement> {
    return screen.findByRole<HTMLInputElement>('textbox', { name: 'Tagline' });
}

/** Confirm the open `useConfirm` dialog with its `label` button. */
async function confirmDialog(page: RenderAdminResult, label: string): Promise<void> {
    const dialog = await screen.findByRole('alertdialog');
    await page.user.click(within(dialog).getByRole('button', { name: label }));
}

/** Open the `index`th Select's listbox and pick the option with this label. */
async function pickOption(
    page: RenderAdminResult,
    index: number,
    label: string
): Promise<void> {
    const trigger = screen.getAllByRole('combobox')[index];
    if (trigger === undefined) throw new Error(`no combobox at ${index}`);
    await page.user.click(trigger);
    await page.user.click(await screen.findByRole('option', { name: label }));
}

const MERGE = 'Merge into current';
const DISCARD = 'Discard staged change';
const MERGE_MESSAGE =
    "The current entry's content will be replaced with the staged change. This cannot be undone.";
const DIVERGED_MESSAGE =
    'Heads up: the current entry has been edited since this staged change was created. Merging will overwrite those edits. This cannot be undone.';

describe('the global edit page', () => {
    it('renders an empty form for a global that has never been saved', async () => {
        const { api } = makeApi({ canonical: null });
        mountPage({ api, config: config() });

        await waitFor(async () => {
            expect((await tagline()).value).toBe('');
        });
        // Nothing saved means nothing to badge.
        expect(document.querySelector('.am-badge')).toBeNull();
    });

    it('saves through `update` with the fields and the status', async () => {
        const { api, update } = makeApi({ canonical: makeGlobal() });
        const page = mountPage({ api, config: config() });

        const field = await tagline();
        await page.user.clear(field);
        await page.user.type(field, 'A new tagline');
        await page.user.click(await screen.findByRole('button', { name: 'Update' }));

        await waitFor(() => {
            expect(update).toHaveBeenCalledTimes(1);
        });
        expect(update.mock.calls[0]?.[0]).toEqual({
            key: KEY,
            locale: 'en',
            staged: false,
            data: { fields: { tagline: 'A new tagline' }, status: 'unpublished' },
        });
    });

    it('publishes through the same `update` when the panel moved the status', async () => {
        const { api, update, publish } = makeApi({ canonical: makeGlobal() });
        const page = mountPage({ api, config: config() });

        await tagline();
        // The publish panel's status select is the only combobox on the page.
        await pickOption(page, 0, 'Published');
        await page.user.click(await screen.findByRole('button', { name: 'Update' }));

        await waitFor(() => {
            expect(update).toHaveBeenCalledTimes(1);
        });
        expect(update.mock.calls[0]?.[0]).toMatchObject({
            key: KEY,
            locale: 'en',
            data: { status: 'published' },
        });
        expect(publish).not.toHaveBeenCalled();
    });

    it('shows no locale switcher on a global that is not translatable', async () => {
        const { api } = makeApi({ canonical: makeGlobal() });
        mountPage({ api, config: config() });

        await tagline();
        // Only the publish panel's status select.
        expect(screen.getAllByRole('combobox').length).toBe(1);
    });

    it('opens a missing locale instead of writing it', async () => {
        const { api, update } = makeApi({
            canonical: makeGlobal({ locales: ['en'] }),
        });
        const page = mountPage({
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

        await tagline();
        // Statuses are off here, so the switcher is the only combobox.
        await pickOption(page, 0, 'Add FR');

        await waitFor(() => {
            expect(page.location()).toBe(`${BASE_PATH}?locale=fr`);
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

        await tagline();
        expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
        expect(
            screen.getByText('You have read-only access to this entry type.')
        ).toBeDefined();
    });

    /** The staged view of a staging-capable global, with a staged row present. */
    async function mountStaged(diverged = false) {
        const staged = {
            ...makeGlobal({ staged: true, fields: { tagline: 'Staged' } }),
            diverged,
        };
        const handles = makeApi({ canonical: makeGlobal(), staged });
        const page = mountPage({
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
        await waitFor(async () => {
            expect((await tagline()).value).toBe('Staged');
        });
        return { ...handles, page };
    }

    it('merges the staged change from the staged view', async () => {
        const { mergeStaged, page } = await mountStaged();

        await page.user.click(screen.getByRole('button', { name: MERGE }));
        await confirmDialog(page, MERGE);

        await waitFor(() => {
            expect(mergeStaged).toHaveBeenCalledWith({ key: KEY, locale: 'en' });
        });
    });

    it('confirms a merge plainly when the canonical has not moved on', async () => {
        const { page } = await mountStaged(false);

        await page.user.click(screen.getByRole('button', { name: MERGE }));

        expect(await screen.findByText(MERGE_MESSAGE)).toBeDefined();
        expect(screen.queryByText(DIVERGED_MESSAGE)).toBeNull();
    });

    it('warns before a merge when the server reports the canonical diverged', async () => {
        const { page } = await mountStaged(true);

        await page.user.click(screen.getByRole('button', { name: MERGE }));

        expect(await screen.findByText(DIVERGED_MESSAGE)).toBeDefined();
        expect(screen.queryByText(MERGE_MESSAGE)).toBeNull();
    });

    it('saves the staged row itself, not the canonical one', async () => {
        const { update, page } = await mountStaged();

        const field = await tagline();
        await page.user.clear(field);
        await page.user.type(field, 'Staged edit');
        await page.user.click(screen.getByRole('button', { name: 'Update' }));

        await waitFor(() => {
            expect(update).toHaveBeenCalledTimes(1);
        });
        expect(update.mock.calls[0]?.[0]).toEqual({
            key: KEY,
            locale: 'en',
            staged: true,
            data: { fields: { tagline: 'Staged edit' } },
        });
    });

    it('discards the staged change from the staged view', async () => {
        const { deleteStaged, page } = await mountStaged();

        await page.user.click(screen.getByRole('button', { name: DISCARD }));
        await confirmDialog(page, DISCARD);

        await waitFor(() => {
            expect(deleteStaged).toHaveBeenCalledWith({ key: KEY, locale: 'en' });
        });
    });
});
