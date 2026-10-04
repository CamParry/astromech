/**
 * @vitest-environment happy-dom
 *
 * The entry edit page's status. A save sends `status` and `publishedAt` only
 * when the editor changed them, since the server refuses either without the
 * publish permission, and a user without it sees the status read-only.
 */

import type {
    AdminEntryType,
    EntriesService,
    Entry,
    EntryStatus,
    QueryResult,
    User,
} from '@/types/index';
import { screen, waitFor } from '@testing-library/react';
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

const { adminConfig } = vi.hoisted(() => ({
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en'],
        entryTypes: {} as Record<string, unknown>,
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

const TYPE = 'post';
const ID = 'p1';
const EDITOR = [`entry:${TYPE}:read`, `entry:${TYPE}:update`];
const PUBLISHER = [...EDITOR, `entry:${TYPE}:publish`];
const STATUS_HINT = 'Only users who can publish can change the status.';

const POST: AdminEntryType = {
    single: 'Post',
    plural: 'Posts',
    versioning: false,
    translatable: false,
    slug: null,
    adminColumns: [],
    fields: { main: [], sidebar: [] },
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

function makeEntry(overrides: Partial<Entry> = {}): Entry {
    return {
        id: ID,
        type: TYPE,
        locale: 'en',
        locales: ['en'],
        title: 'Live post',
        status: 'published' as EntryStatus,
        publishedAt: new Date('2026-01-01T09:00:00Z'),
        fields: {},
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        ...overrides,
    } as Entry;
}

/** Mount the edit page on a post (published unless `stored` says otherwise), signed in with `permissions`. */
async function mountPage(permissions: string[], stored: Partial<Entry> = {}) {
    const update = vi.fn(async (params: { data: { title: string } }) =>
        makeEntry({ ...stored, title: params.data.title })
    );
    client.entries = {
        get: vi.fn(async () => makeEntry(stored)),
        update,
    } as unknown as EntriesService;
    adminConfig.entryTypes[TYPE] = POST;

    const queryClient = createTestQueryClient();
    // No known users, so the page's author names need no request either.
    queryClient.setQueryData<QueryResult<User>>(queryKeys.users.list({ limit: 'all' }), {
        data: [],
        pagination: null,
    });
    const page = renderAdmin(<EntryEditPage type={TYPE} id={ID} locale="en" />, {
        url: `/entries/${TYPE}/${ID}?locale=en`,
        permissions,
        queryClient,
    });
    const title = (await screen.findByLabelText(/Title/)) as HTMLInputElement;
    await waitFor(() => expect(title.value).toBe('Live post'));
    return { page, update, title };
}

/** The publish panel's status select. */
function statusSelect(): HTMLElement {
    return screen.getByRole('combobox', { name: 'Status' });
}

describe('the entry edit page status', () => {
    it.each([
        ['without publish', EDITOR],
        ['with publish', PUBLISHER],
    ])(
        'leaves the status and publish date out of a save that kept them, %s',
        async (_, permissions) => {
            const { page, update, title } = await mountPage(permissions);

            await page.user.clear(title);
            await page.user.type(title, 'Renamed post');
            await page.user.click(screen.getByRole('button', { name: 'Update' }));

            await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
            expect(update.mock.calls[0]?.[0]).toEqual({
                type: TYPE,
                id: ID,
                locale: 'en',
                staged: false,
                data: { title: 'Renamed post', fields: {} },
            });
        }
    );

    it('shows the status read-only without publish, saying why', async () => {
        await mountPage(EDITOR);

        const select = statusSelect();
        expect(select.textContent).toContain('Published');
        expect(select.hasAttribute('data-disabled')).toBe(true);
        const hint = screen.getByText(STATUS_HINT);
        expect(select.getAttribute('aria-describedby')?.split(' ')).toContain(hint.id);
    });

    it('lets a user with publish change the status, and sends the change', async () => {
        const { page, update } = await mountPage(PUBLISHER);

        expect(screen.queryByText(STATUS_HINT)).toBeNull();
        await page.user.click(statusSelect());
        await page.user.click(await screen.findByRole('option', { name: 'Unpublished' }));
        await page.user.click(screen.getByRole('button', { name: 'Update' }));

        await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
        expect(update.mock.calls[0]?.[0]).toEqual({
            type: TYPE,
            id: ID,
            locale: 'en',
            staged: false,
            data: { title: 'Live post', fields: {}, status: 'unpublished' },
        });
    });

    it('sends a changed publish date alone when the status stays scheduled', async () => {
        const { page, update } = await mountPage(PUBLISHER, {
            status: 'scheduled',
            publishedAt: new Date('2027-01-01T09:00:00Z'),
        });

        const date = screen.getByLabelText('Publish date');
        await page.user.clear(date);
        await page.user.type(date, '2027-02-01T09:00');
        await page.user.click(screen.getByRole('button', { name: 'Update' }));

        await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
        expect(update.mock.calls[0]?.[0]).toMatchObject({
            data: {
                title: 'Live post',
                fields: {},
                publishedAt: new Date('2027-02-01T09:00'),
            },
        });
        expect(update.mock.calls[0]?.[0].data).not.toHaveProperty('status');
    });
});
