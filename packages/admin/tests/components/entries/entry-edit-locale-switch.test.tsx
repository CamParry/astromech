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
 * This mounts the REAL `EntryEditPage` through `renderAdmin` and subscribes to
 * the page's own `form.store`, so a partial group is caught at the transition
 * that writes it rather than only at submit. That subscription is the one mock
 * of an admin hook left: no rendered output shows a transient partial group.
 */

import type { RenderAdminResult } from '../../_support/render-admin';
import type * as UseEntryForm from '@/admin/hooks/use-entry-form';
import type {
    AdminEntryType,
    EntriesService,
    Entry,
    EntryStatus,
    QueryResult,
    User,
} from '@/types/index';
import type { QueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryEditPage } from '@/admin/components/entries/entry-edit-page';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import { createTestQueryClient, renderAdmin } from '../../_support/render-admin';

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

// The shim declares one locale; the switcher needs two to have anywhere to go.
const { adminConfig } = vi.hoisted(() => ({
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en', 'fr'],
        entryTypes: {} as Record<string, unknown>,
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

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

beforeEach(() => {
    transitions.length = 0;
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
    adminColumns: [],
    fields: {
        main: [
            { name: 'excerpt', type: 'textarea', label: 'Excerpt' },
            // The demo's `seo.section()` shape: a named group of two sub-keys.
            {
                name: 'seo',
                type: 'group',
                label: 'SEO',
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

/** The page as its route renders it: the `locale` search param mapped to a prop. */
function EditRoute() {
    const search = useSearch({ strict: false }) as { locale?: string };
    return <EntryEditPage type={TYPE} id={ID} locale={search.locale} />;
}

function mountApp(queryClient: QueryClient, api: EntriesService) {
    client.entries = api;
    adminConfig.entryTypes[TYPE] = ENTRY_TYPE_CONFIG;

    return renderAdmin(<EditRoute />, {
        url: `/entries/${TYPE}/${ID}?locale=en`,
        queryClient,
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
    const queryClient = createTestQueryClient();
    // No known users, so the page's author names need no request either.
    queryClient.setQueryData<QueryResult<User>>(queryKeys.users.list({ limit: 'all' }), {
        data: [],
        pagination: null,
    });
    return queryClient;
}

/**
 * Switch locale through the page's switcher from an edited form: the
 * unsaved-changes guard asks, and the editor discards the edits.
 */
async function switchDiscarding(page: RenderAdminResult, to: 'en' | 'fr'): Promise<void> {
    const from = to === 'fr' ? 'EN' : 'FR';
    const trigger = screen
        .getAllByRole('combobox')
        .find((element) => element.textContent === from);
    if (trigger === undefined) throw new Error(`no locale switcher showing ${from}`);
    await page.user.click(trigger);
    await page.user.click(await screen.findByRole('option', { name: to.toUpperCase() }));
    const dialog = await screen.findByRole('alertdialog', {
        name: 'Discard unsaved changes?',
    });
    await page.user.click(
        within(dialog).getByRole('button', { name: 'Discard changes' })
    );
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
        const queryClient = makeClient();
        const { api, update } = makeApi();
        const page = mountApp(queryClient, api);
        const { user } = page;

        // Edit the meta title alone, leaving the sibling untouched.
        const title = await findControl('input[name="seo.title"]');
        await user.clear(title);
        await user.type(title, 'EN edited');

        // Switch to a locale the entry already has: same id, different
        // `locale` param.
        await switchDiscarding(page, 'fr');
        await waitFor(() => {
            expect(control('input[name="seo.title"]').value).toBe('FR title');
        });
        assertNoPartialGroup();

        // Edit on the other locale, then come back.
        const other = await findControl('input[name="seo.title"]');
        await user.clear(other);
        await user.type(other, 'FR edited');
        await switchDiscarding(page, 'en');
        await waitFor(() => {
            expect(control('input[name="seo.title"]').value).toBe('EN title');
        });
        assertNoPartialGroup();

        const back = await findControl('input[name="seo.title"]');
        await user.clear(back);
        await user.type(back, 'EN edited again');
        await user.click(await screen.findByRole('button', { name: 'Update' }));
        // The success toast comes from `onSuccess`, after `form.reset` has run.
        await screen.findByText('Case Study updated.');

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
        const page = mountApp(queryClient, api);

        await waitFor(() => {
            expect(control('input[name="seo.title"]').value).toBe('EN title');
        });

        await page.navigate(`/entries/${TYPE}/${ID}?locale=fr`);

        // The route component is not remounted; the page keys its body on the
        // locale, so the new row arrives through a fresh form.
        await waitFor(() => {
            expect(control('input[name="seo.title"]').value).toBe('FR title');
        });
        assertNoPartialGroup();
    });

    it('loads the sibling locale’s own values when the form has been edited', async () => {
        const queryClient = makeClient();
        const { api, update } = makeApi();
        const page = mountApp(queryClient, api);
        const { user } = page;

        // Touch the form. From here TanStack Form stops copying `defaultValues`
        // in, so only the remount can show the other locale's row.
        const title = await findControl('input[name="seo.title"]');
        await user.clear(title);
        await user.type(title, 'EN edited');
        await waitFor(() => {
            expect(control('input[name="seo.title"]').value).toBe('EN edited');
        });

        await switchDiscarding(page, 'fr');

        await waitFor(() => {
            expect(control('input[name="seo.title"]').value).toBe('FR title');
            expect(control('textarea[name="excerpt"]').value).toBe('Un extrait');
            expect(control('#entry-title').value).toBe('Une étude de cas');
        });

        // Back to the first locale: its stored values, not the unsaved edit.
        await page.navigate(`/entries/${TYPE}/${ID}?locale=en`);

        await waitFor(() => {
            expect(control('input[name="seo.title"]').value).toBe('EN title');
            expect(control('textarea[name="excerpt"]').value).toBe('An excerpt');
        });
        expect(update).not.toHaveBeenCalled();
        assertNoPartialGroup();
    });
});
