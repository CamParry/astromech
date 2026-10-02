/**
 * @vitest-environment happy-dom
 *
 * The Cmd+K palette: Ctrl+K opens it, typing filters the static shortcuts and
 * runs a live search, the arrow keys move the selection, Enter goes to the
 * selected item and Escape closes it. Plugin pages and the live search are
 * limited to what the signed-in user may read.
 */

import type { Entry, QueryResult } from '@/types/index';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CommandPalette,
    CommandPaletteProvider,
} from '@/admin/components/ui/command-palette';
import { renderAdmin } from '../../_support/render-admin';

const { entriesQuery, usersQuery, mediaQuery } = vi.hoisted(() => ({
    entriesQuery: vi.fn(),
    usersQuery: vi.fn(),
    mediaQuery: vi.fn(),
}));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: {
            ...real.astromechUntypedClient,
            entries: { query: entriesQuery },
            users: { query: usersQuery },
            media: { query: mediaQuery },
        },
    };
});

// The shim's config plus a plugin with two nav pages, one behind a permission.
vi.mock('virtual:astromech/admin-config', async (importOriginal) => {
    const real = await importOriginal<{ default: object }>();
    return {
        default: {
            ...real.default,
            plugins: [
                {
                    namespace: 'seo',
                    label: 'SEO',
                    nav: [
                        {
                            label: 'Settings',
                            to: '/plugin/seo/settings',
                            permission: 'plugin:seo:settings',
                        },
                        { label: 'Sitemap', to: '/plugin/seo/sitemap' },
                    ],
                },
            ],
        },
    };
});

function emptyPage<T>(): QueryResult<T> {
    return { data: [], pagination: { page: 1, pages: 1, total: 0, limit: 5 } };
}

beforeEach(() => {
    entriesQuery.mockResolvedValue(emptyPage());
    usersQuery.mockResolvedValue(emptyPage());
    mediaQuery.mockResolvedValue(emptyPage());
});

afterEach(() => {
    entriesQuery.mockReset();
    usersQuery.mockReset();
    mediaQuery.mockReset();
});

function mountPalette(permissions: string[] = ['*']) {
    return renderAdmin(
        <CommandPaletteProvider>
            <h1>Dashboard page</h1>
            <CommandPalette />
        </CommandPaletteProvider>,
        { permissions }
    );
}

/**
 * Open the palette with Ctrl+K and wait for its input to take focus. The
 * router renders the page asynchronously, so the shortcut waits for it.
 */
async function openPalette(view: ReturnType<typeof mountPalette>): Promise<HTMLElement> {
    await screen.findByRole('heading', { name: 'Dashboard page' });
    await view.user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });
    const input = within(dialog).getByPlaceholderText('Search…');
    await waitFor(() => {
        expect(document.activeElement).toBe(input);
    });
    return input;
}

function optionLabels(): string[] {
    return screen.queryAllByRole('option').map((option) => option.textContent ?? '');
}

function selectedLabel(): string | null {
    const selected = screen
        .queryAllByRole('option')
        .find((option) => option.getAttribute('aria-selected') === 'true');
    return selected?.textContent ?? null;
}

describe('the command palette', () => {
    it('opens on Ctrl+K with every shortcut listed', async () => {
        const view = mountPalette();
        expect(screen.queryByRole('dialog')).toBeNull();

        await openPalette(view);

        expect(optionLabels()).toEqual([
            'Dashboard',
            'Media',
            'Users',
            'Posts',
            'SEO: Settings',
            'SEO: Sitemap',
        ]);
        expect(selectedLabel()).toBe('Dashboard');
    });

    it('filters the shortcuts as the user types', async () => {
        const view = mountPalette();
        await openPalette(view);

        await view.user.keyboard('se');

        await waitFor(() => {
            expect(optionLabels()).toEqual(['Users', 'SEO: Settings', 'SEO: Sitemap']);
        });
    });

    it('says so when nothing matches', async () => {
        const view = mountPalette();
        await openPalette(view);

        await view.user.keyboard('zzz');

        expect(await screen.findByText('No results')).toBeDefined();
        expect(optionLabels()).toEqual([]);
    });

    it('moves the selection with the arrow keys and wraps at either end', async () => {
        const view = mountPalette();
        await openPalette(view);

        await view.user.keyboard('{ArrowDown}{ArrowDown}');
        expect(selectedLabel()).toBe('Users');

        await view.user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
        expect(selectedLabel()).toBe('SEO: Sitemap');
    });

    it('goes to the selected shortcut on Enter and closes', async () => {
        const view = mountPalette();
        await openPalette(view);

        await view.user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

        await waitFor(() => {
            expect(view.pathname()).toBe('/users');
        });
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).toBeNull();
        });
    });

    it('closes on Escape without navigating', async () => {
        const view = mountPalette();
        await openPalette(view);

        await view.user.keyboard('{Escape}');

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).toBeNull();
        });
        expect(view.pathname()).toBe('/');
    });

    it('lists a found entry under its type and opens it on Enter', async () => {
        const entry = {
            id: 'e1',
            type: 'post',
            locale: 'en',
            title: 'Ada Lovelace',
            fields: {},
        } as unknown as Entry;
        entriesQuery.mockResolvedValue({ ...emptyPage(), data: [entry] });
        const view = mountPalette();
        await openPalette(view);

        await view.user.keyboard('ada');

        expect(await screen.findByRole('option', { name: 'Ada Lovelace' })).toBeDefined();
        expect(screen.getByText('Posts')).toBeDefined();

        await view.user.keyboard('{Enter}');
        await waitFor(() => {
            expect(view.pathname()).toBe('/entries/post/e1');
        });
    });

    it('searches only the entry types, users and media the user may read', async () => {
        const view = mountPalette(['entry:post:read']);
        await openPalette(view);

        await view.user.keyboard('ada');

        await waitFor(() => {
            expect(entriesQuery).toHaveBeenCalledWith({
                type: ['post'],
                search: 'ada',
                limit: 5,
            });
        });
        expect(usersQuery).not.toHaveBeenCalled();
        expect(mediaQuery).not.toHaveBeenCalled();
    });

    it('drops a plugin page the user lacks the permission for', async () => {
        const view = mountPalette(['entry:post:read']);
        await openPalette(view);

        // One page left, so it is no longer prefixed with the plugin's label.
        expect(optionLabels()).toContain('Sitemap');
        expect(optionLabels()).not.toContain('SEO: Settings');
        expect(optionLabels()).not.toContain('Settings');
    });

    // Defect: the sidebar hides Media and Users from a user without
    // `media:read` or `users:read`, but the palette lists both to everyone, so
    // the user can pick a page that will refuse them.
    it.fails('hides Media and Users from a user who cannot read them', async () => {
        const view = mountPalette(['entry:post:read']);
        await openPalette(view);

        expect(optionLabels()).not.toContain('Media');
        expect(optionLabels()).not.toContain('Users');
    });
});
