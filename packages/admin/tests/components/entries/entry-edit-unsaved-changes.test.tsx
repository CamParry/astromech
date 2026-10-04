/**
 * @vitest-environment happy-dom
 *
 * The entry edit page's writes that leave the form: adding a locale and
 * duplicating. Over unsaved edits each asks before it writes, and once the
 * editor discards them it opens the new row without asking again.
 */

import type {
    AdminEntryType,
    EntriesService,
    Entry,
    EntryStatus,
    QueryResult,
    User,
} from '@/types/index';
import { useLocation, useSearch } from '@tanstack/react-router';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

// The shim declares one locale; adding one needs a second.
const { adminConfig } = vi.hoisted(() => ({
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en', 'fr'],
        entryTypes: {} as Record<string, unknown>,
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

const TYPE = 'caseStudy';
const ID = 'cs1';
const COPY_ID = 'cs2';

function makeEntry(id: string, locale: string, locales: string[]): Entry {
    return {
        id,
        type: TYPE,
        locale,
        locales,
        title: 'A case study',
        status: 'published' as EntryStatus,
        fields: { customer: 'Lumenflow' },
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
        main: [{ name: 'customer', type: 'text', label: 'Customer' }],
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

/** The page as its route renders it: the id and the `locale` search param mapped to props. */
function EditRoute() {
    const search = useSearch({ strict: false }) as { locale?: string };
    const id = useLocation().pathname.endsWith(COPY_ID) ? COPY_ID : ID;
    return <EntryEditPage type={TYPE} id={id} locale={search.locale} />;
}

/**
 * Mount the page on an entry with an `en` row alone, then edit its one field.
 * `update` is the write that adds a locale; `duplicate` copies the entry.
 */
async function mountEdited() {
    const update = vi.fn(async (params: { id: string; locale: string }) =>
        makeEntry(params.id, params.locale, ['en', params.locale])
    );
    const duplicate = vi.fn(async () => makeEntry(COPY_ID, 'en', ['en']));
    client.entries = {
        get: vi.fn(async (params: { id: string; locale?: string }) =>
            makeEntry(params.id, params.locale ?? 'en', ['en'])
        ),
        update,
        duplicate,
    } as unknown as EntriesService;
    adminConfig.entryTypes[TYPE] = ENTRY_TYPE_CONFIG;

    const queryClient = createTestQueryClient();
    // No known users, so the page's author names need no request either.
    queryClient.setQueryData<QueryResult<User>>(queryKeys.users.list({ limit: 'all' }), {
        data: [],
        pagination: null,
    });
    const page = renderAdmin(<EditRoute />, {
        url: `/entries/${TYPE}/${ID}?locale=en`,
        queryClient,
    });

    const customer = (await screen.findByLabelText('Customer')) as HTMLInputElement;
    await page.user.type(customer, ' edited');
    return { page, update, duplicate, customer };
}

/** The header's locale switcher, which shows the locale being edited. */
function localeSwitcher(): HTMLElement {
    const trigger = screen
        .getAllByRole('combobox')
        .find((element) => element.textContent === 'EN');
    if (trigger === undefined) throw new Error('no locale switcher showing EN');
    return trigger;
}

/** Answer the unsaved-changes dialog with the button labelled `label`. */
async function answerDiscard(
    user: ReturnType<typeof renderAdmin>['user'],
    label: 'Keep editing' | 'Discard changes'
): Promise<void> {
    const dialog = await screen.findByRole('alertdialog', {
        name: 'Discard unsaved changes?',
    });
    await user.click(within(dialog).getByRole('button', { name: label }));
    await waitFor(() => expect(dialog.isConnected).toBe(false));
}

describe('the entry edit page over unsaved edits', () => {
    it('asks before adding a locale, and writes nothing when the editor stays', async () => {
        const { page, update, customer } = await mountEdited();

        await page.user.click(localeSwitcher());
        await page.user.click(await screen.findByRole('option', { name: 'Add FR' }));
        await answerDiscard(page.user, 'Keep editing');

        expect(update).not.toHaveBeenCalled();
        expect(customer.value).toBe('Lumenflow edited');
        expect(screen.queryByRole('alertdialog')).toBeNull();

        await page.user.click(localeSwitcher());
        await page.user.click(await screen.findByRole('option', { name: 'Add FR' }));
        await answerDiscard(page.user, 'Discard changes');

        await waitFor(() => expect(page.search()).toEqual({ locale: 'fr' }));
        expect(update).toHaveBeenCalledWith({
            type: TYPE,
            id: ID,
            locale: 'fr',
            data: {},
        });
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('asks before duplicating, and writes nothing when the editor stays', async () => {
        const { page, duplicate, customer } = await mountEdited();

        await page.user.click(screen.getByRole('button', { name: 'More actions' }));
        await page.user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
        await answerDiscard(page.user, 'Keep editing');

        expect(duplicate).not.toHaveBeenCalled();
        expect(customer.value).toBe('Lumenflow edited');
        expect(screen.queryByRole('alertdialog')).toBeNull();

        await page.user.click(screen.getByRole('button', { name: 'More actions' }));
        await page.user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
        await answerDiscard(page.user, 'Discard changes');

        await waitFor(() => expect(page.pathname()).toBe(`/entries/${TYPE}/${COPY_ID}`));
        expect(duplicate).toHaveBeenCalledWith({ type: TYPE, id: ID });
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });
});
