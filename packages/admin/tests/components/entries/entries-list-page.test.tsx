/**
 * @vitest-environment happy-dom
 *
 * The entries list keeps its filter, sort and page in the URL through
 * `useListController`: the URL drives the query, and a sort writes the URL
 * and returns to the first page. An id the config does not declare renders
 * the not-found page, and a user without read sees the forbidden message.
 */

import type { AdminEntryType, Entry, QueryResult, User } from '@/types/index';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntriesListPage } from '@/admin/components/entries/entries-list-page';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import { validateEntriesListSearch } from '@/admin/utilities/entry-admin-path';
import { createTestQueryClient, renderAdmin } from '../../_support/render-admin';

const { query, adminConfig } = vi.hoisted(() => ({
    query: vi.fn(),
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en'],
        entryTypes: {} as Record<string, unknown>,
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: { ...real.astromechUntypedClient, entries: { query } },
    };
});

const POST: AdminEntryType = {
    single: 'Post',
    plural: 'Posts',
    versioning: false,
    translatable: false,
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

afterEach(() => {
    query.mockReset();
    adminConfig.entryTypes = {};
    adminConfig.locales = ['en'];
    localStorage.removeItem('am-cols-post');
});

function makeEntry(id: string, title: string): Entry {
    return {
        id,
        type: 'post',
        locale: 'en',
        locales: ['en'],
        title,
        status: 'published',
        fields: {},
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
    } as unknown as Entry;
}

/** Mount the page at `url` under a real router, beside the edit page its rows link to. */
function mountList(url: string, type = 'post', permissions: string[] = ['*']) {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData<QueryResult<User>>(queryKeys.users.list({ limit: 'all' }), {
        data: [],
        pagination: null,
    });
    return renderAdmin(
        [
            {
                path: '/entries/$type',
                validateSearch: validateEntriesListSearch,
                component: () => <EntriesListPage type={type} />,
            },
            { path: '/entries/$type/$id', component: () => <p>Entry page</p> },
        ],
        { url, queryClient, permissions }
    );
}

describe('the entries list', () => {
    it('queries with the filter and page the URL holds', async () => {
        adminConfig.entryTypes = { post: POST };
        query.mockResolvedValue({
            data: [makeEntry('e1', 'Hello')],
            pagination: { page: 2, pages: 3, total: 41, limit: 20 },
        });

        mountList('/entries/post?status=published&page=2&q=hel');

        expect(await screen.findByText('Hello')).toBeTruthy();
        expect(query).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'post',
                where: { status: 'published' },
                page: 2,
                search: 'hel',
            })
        );
    });

    it('lists every status when the URL holds an unknown one', async () => {
        adminConfig.entryTypes = { post: POST };
        query.mockResolvedValue({
            data: [makeEntry('e1', 'Hello')],
            pagination: { page: 1, pages: 1, total: 1, limit: 20 },
        });

        mountList('/entries/post?status=archived');

        expect(await screen.findByText('Hello')).toBeTruthy();
        expect(query.mock.calls[0]?.[0]).not.toHaveProperty('where');
        expect(query.mock.calls[0]?.[0]).not.toHaveProperty('trashed');
    });

    it('shows each row’s status in words', async () => {
        adminConfig.entryTypes = { post: POST };
        query.mockResolvedValue({
            data: [makeEntry('e1', 'Hello')],
            pagination: { page: 1, pages: 1, total: 1, limit: 20 },
        });

        mountList('/entries/post');

        expect(await screen.findByRole('cell', { name: 'Published' })).toBeTruthy();
    });

    it('shows a status field’s own value in a status column', async () => {
        adminConfig.entryTypes = {
            post: {
                ...POST,
                adminColumns: [{ field: 'review', label: 'Review', kind: 'status' }],
            },
        };
        query.mockResolvedValue({
            data: [{ ...makeEntry('e1', 'Hello'), fields: { review: 'scheduled' } }],
            pagination: { page: 1, pages: 1, total: 1, limit: 20 },
        });

        mountList('/entries/post');

        expect(await screen.findByRole('cell', { name: 'Scheduled' })).toBeTruthy();
        expect(screen.getAllByRole('cell', { name: 'Published' })).toHaveLength(1);
    });

    it('writes a sort to the URL and returns to the first page', async () => {
        adminConfig.entryTypes = { post: POST };
        query.mockResolvedValue({
            data: [makeEntry('e1', 'Hello')],
            pagination: { page: 2, pages: 3, total: 41, limit: 20 },
        });
        const view = mountList('/entries/post?page=2');
        await screen.findByText('Hello');

        await userEvent.click(screen.getByRole('button', { name: /Title/ }));

        await waitFor(() => expect(view.search()).toEqual({ sort: 'title:asc' }));
    });

    it('sends a field sort to the query and keeps the rows in the order it answers', async () => {
        adminConfig.entryTypes = {
            post: {
                ...POST,
                adminColumns: [{ field: 'price', label: 'Price', sortable: true }],
            },
        };
        // Numeric order, which a sort by text would turn into 10, 9.
        query.mockResolvedValue({
            data: [
                { ...makeEntry('e1', 'Cheap'), fields: { price: 9 } },
                { ...makeEntry('e2', 'Dear'), fields: { price: 10 } },
            ],
            pagination: { page: 1, pages: 1, total: 2, limit: 20 },
        });

        mountList('/entries/post?sort=price:asc');

        await screen.findByText('Cheap');
        expect(query).toHaveBeenCalledWith(
            expect.objectContaining({ sort: { price: 'asc' } })
        );
        const titles = screen
            .getAllByRole('link')
            .map((link) => link.textContent)
            .filter((text) => text === 'Cheap' || text === 'Dear');
        expect(titles).toEqual(['Cheap', 'Dear']);
    });

    it('links each title to its row, in the row’s locale, for a keyboard user', async () => {
        adminConfig.entryTypes = {
            post: {
                ...POST,
                translatable: true,
                capabilities: { ...POST.capabilities, translatable: true },
            },
        };
        adminConfig.locales = ['en', 'fr'];
        query.mockResolvedValue({
            data: [
                { ...makeEntry('e1', 'Bonjour'), locale: 'fr', locales: ['en', 'fr'] },
            ],
            pagination: { page: 1, pages: 1, total: 1, limit: 20 },
        });
        const view = mountList('/entries/post?locale=fr');
        const link = await screen.findByRole('link', { name: 'Bonjour' });

        expect(link.getAttribute('href')).toBe('/entries/post/e1?locale=fr');
        link.focus();
        await userEvent.keyboard('{Enter}');

        await waitFor(() => expect(view.pathname()).toBe('/entries/post/e1'));
        expect(view.search()).toEqual({ locale: 'fr' });
    });

    it('links the first shown column once the title column is hidden', async () => {
        adminConfig.entryTypes = { post: POST };
        query.mockResolvedValue({
            data: [makeEntry('e1', 'Hello')],
            pagination: { page: 1, pages: 1, total: 1, limit: 20 },
        });
        const view = mountList('/entries/post');
        await screen.findByRole('link', { name: 'Hello' });

        await userEvent.click(screen.getByRole('button', { name: 'Toggle columns' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Title' }));
        await waitFor(() => expect(screen.queryByText('Hello')).toBeNull());
        const link = screen.getByRole('link', { name: 'Published' });
        link.focus();
        await userEvent.keyboard('{Enter}');

        await waitFor(() => expect(view.pathname()).toBe('/entries/post/e1'));
    });

    it.each([
        ['offers', ['*'], ['Publish', 'Unpublish', 'Move to trash', 'Delete']],
        [
            'leaves out',
            ['entry:post:read', 'entry:post:delete'],
            ['Move to trash', 'Delete'],
        ],
    ])(
        '%s bulk publish and unpublish by the publish permission',
        async (_, permissions, actions) => {
            adminConfig.entryTypes = { post: POST };
            query.mockResolvedValue({
                data: [makeEntry('e1', 'Hello')],
                pagination: { page: 1, pages: 1, total: 1, limit: 20 },
            });
            mountList('/entries/post', 'post', permissions);
            await screen.findByText('Hello');

            const [firstRow] = screen.getAllByRole('checkbox', { name: 'Select row' });
            await userEvent.click(firstRow as HTMLElement);
            await userEvent.click(
                screen.getByRole('button', { name: 'Bulk actions (1)' })
            );

            const items = await screen.findAllByRole('menuitem');
            expect(items.map((item) => item.textContent)).toEqual(actions);
        }
    );

    it('shows a user without read the forbidden message in place', async () => {
        adminConfig.entryTypes = { post: POST };
        const view = mountList('/entries/post', 'post', ['entry:page:read']);

        expect(
            await screen.findByText("You don't have permission to view this page.")
        ).toBeTruthy();
        expect(view.pathname()).toBe('/entries/post');
        expect(query).not.toHaveBeenCalled();
    });

    it('renders the not-found page for a type the config does not declare', async () => {
        mountList('/entries/missing', 'missing');

        expect(await screen.findByText('/entries/missing')).toBeTruthy();
        expect(query).not.toHaveBeenCalled();
    });
});
