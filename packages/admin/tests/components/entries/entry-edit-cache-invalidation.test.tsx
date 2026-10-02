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
 * This mounts the REAL `EntryEditPage`, not a hand-built stand-in, through
 * `renderAdmin`, so a save must survive whatever the real page's `onSuccess`
 * does, not whatever this test's own copy of it does. It declares its entry
 * type in a mocked config rather than going through a route loader.
 */

import type {
    AdminEntryType,
    EntriesService,
    Entry,
    EntryStatus,
    QueryResult,
    User,
} from '@/types/index';
import type { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntryEditPage } from '@/admin/components/entries/entry-edit-page';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import { createTestQueryClient, renderAdmin } from '../../_support/render-admin';

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

/** Mount the real `EntryEditPage` over a stub entries client. */
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

    const page = renderAdmin(<EntryEditPage type={TYPE} id={ID} locale={LOCALE} />, {
        queryClient,
    });
    return { update, user: page.user };
}

/**
 * Wait for the `count`th save to finish: its success toast is up and the Update
 * button has left its loading state, which it does on a render after `onSuccess`.
 */
async function waitForSave(button: HTMLElement, count: number): Promise<void> {
    await waitFor(() => {
        expect(screen.getAllByText('Case Study updated.')).toHaveLength(count);
        // The spinner is the button's only loading signal; it is `aria-hidden`.
        expect(button.querySelector('.am-spinner')).toBeNull();
    });
}

describe('the entry edit page after a save', () => {
    it('keeps displaying the just-saved value, not the stale cached one', async () => {
        // The admin app's real staleTime (admin/main.tsx), so nothing refetches
        // this query on its own in the observation window.
        const queryClient = createTestQueryClient();
        queryClient.setQueryData(
            queryKeys.entries.get(TYPE, ID, LOCALE),
            makeEntry('Lumenflow')
        );
        // No known users, so the page's author names need no request either.
        queryClient.setQueryData<QueryResult<User>>(
            queryKeys.users.list({ limit: 'all' }),
            { data: [], pagination: null }
        );

        const page = mountEditPage(queryClient);
        const { user } = page;

        const input = (await screen.findByDisplayValue('Lumenflow')) as HTMLInputElement;
        expect(input.name).toBe('customer');

        // First edit + save, via the real Update button.
        await user.clear(input);
        await user.type(input, 'Lumenflow International');
        const updateButton = await screen.findByRole('button', { name: 'Update' });
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
