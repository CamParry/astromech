/**
 * @vitest-environment happy-dom
 *
 * The entries list keeps its filter, sort and page in the URL through
 * `useListController`: the URL drives the query, and a sort writes the URL
 * and returns to the first page. An id the config does not declare renders
 * the not-found page.
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

afterEach(() => {
    query.mockReset();
    adminConfig.entryTypes = {};
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

/** Mount the page at `url` under a real router. */
function mountList(url: string, type = 'post') {
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
        ],
        { url, queryClient }
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

    it('renders the not-found page for a type the config does not declare', async () => {
        mountList('/entries/missing', 'missing');

        expect(await screen.findByText('/entries/missing')).toBeTruthy();
        expect(query).not.toHaveBeenCalled();
    });
});
