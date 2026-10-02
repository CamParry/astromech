/**
 * @vitest-environment happy-dom
 *
 * The users list keeps its search, sort and page in the URL: the URL drives
 * the query, a sort by name writes the URL, each row links to its user, and
 * a delete asks before it calls the server.
 */

import type { QueryResult, User } from '@/types/index';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateListSearch } from '@/admin/components/ui/use-list-state';
import { UsersListPage } from '@/admin/components/users/users-list-page';
import { renderAdmin } from '../../_support/render-admin';

const { query, remove } = vi.hoisted(() => ({ query: vi.fn(), remove: vi.fn() }));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: {
            ...real.astromechUntypedClient,
            users: { query, delete: remove },
        },
    };
});

function makeUser(id: string, name: string): User {
    return {
        id,
        email: `${id}@example.com`,
        name,
        emailVerified: true,
        image: null,
        locale: 'en',
        locales: ['en'],
        fields: {},
        role: 'editor',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
    };
}

const PAGE: QueryResult<User> = {
    data: [makeUser('u1', 'Ada Lovelace'), makeUser('u2', 'Grace Hopper')],
    pagination: { page: 1, pages: 1, total: 2, limit: 20 },
};

afterEach(() => {
    query.mockReset();
    remove.mockReset();
});

/** Mount the list at `url` beside a user page its rows link to. */
function mountList(url: string) {
    return renderAdmin(
        [
            {
                path: '/users',
                validateSearch: validateListSearch,
                component: UsersListPage,
            },
            { path: '/users/$id', component: () => <p>User page</p> },
        ],
        { url }
    );
}

describe('the users list', () => {
    it('queries with the search, sort and page the URL holds', async () => {
        query.mockResolvedValue(PAGE);

        mountList('/users?q=ada&sort=email:desc&page=2');

        expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
        expect(query).toHaveBeenCalledWith({
            search: 'ada',
            sort: { email: 'desc' },
            page: 2,
            limit: 20,
        });
    });

    it('writes a sort by name to the URL', async () => {
        query.mockResolvedValue(PAGE);
        const view = mountList('/users?page=2');
        await screen.findByText('Ada Lovelace');

        await userEvent.click(screen.getByRole('button', { name: /Name/ }));

        await waitFor(() => expect(view.search()).toEqual({ sort: 'name:asc' }));
    });

    it('links each row to its user', async () => {
        query.mockResolvedValue(PAGE);
        const view = mountList('/users');

        const link = await screen.findByRole('link', { name: 'Grace Hopper' });
        expect(link.getAttribute('href')).toBe('/users/u2');
        await userEvent.click(screen.getByText('u2@example.com'));

        await waitFor(() => expect(view.pathname()).toBe('/users/u2'));
    });

    it('asks before deleting a user, then deletes it', async () => {
        query.mockResolvedValue(PAGE);
        remove.mockResolvedValue(undefined);
        mountList('/users');
        const row = (await screen.findByText('Ada Lovelace')).closest('tr');

        await userEvent.click(
            within(row as HTMLElement).getByRole('button', { name: 'Actions' })
        );
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
        expect(await screen.findByText('Delete user?')).toBeTruthy();
        expect(remove).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(remove).toHaveBeenCalledWith({ id: 'u1' }));
    });

    it('shows the empty state when there are no users', async () => {
        query.mockResolvedValue({ data: [], pagination: null });

        mountList('/users');

        expect(await screen.findByText('No users found')).toBeTruthy();
    });
});
