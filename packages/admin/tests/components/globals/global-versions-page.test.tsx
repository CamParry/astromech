/**
 * @vitest-environment happy-dom
 *
 * The global version history page. A version snapshots one locale's content
 * row, so the list is that locale's history newest first. The list carries no
 * content, so the page reads the selected version and the one before it to
 * diff them. Restoring names the global by key, locale and version number,
 * never by a row id.
 */

import type {
    AdminGlobal,
    GlobalsService,
    GlobalVersion,
    QueryResult,
    User,
    VersionMetadata,
} from '@/types/index';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GlobalVersionsPage } from '@/admin/components/globals/global-versions-page';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import { createTestQueryClient, renderAdmin } from '../../_support/render-admin';

// The page calls globals through the client; each test sets the stub.
const client = vi.hoisted(() => ({ globals: undefined as unknown }));

const { adminConfig } = vi.hoisted(() => ({
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en'],
        globals: {} as Record<string, unknown>,
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

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

const KEY = 'site';
const BASE_PATH = `/globals/${KEY}`;

const CONFIG = {
    label: 'Site',
    fields: { main: [], sidebar: [] },
    capabilities: {
        statuses: true,
        translatable: false,
        versioning: true,
        staging: false,
    },
    public: false,
    nav: true,
} as AdminGlobal;

function metadata(n: number): VersionMetadata {
    return {
        locale: 'en',
        version: n,
        createdAt: new Date(`2026-0${n}-01T00:00:00Z`),
        createdBy: null,
    };
}

function version(n: number): GlobalVersion {
    return { ...metadata(n), snapshot: { fields: { tagline: `Tagline ${n}` } } };
}

function mountPage() {
    const restoreVersion = vi.fn(async () => null);
    const getVersion = vi.fn(async ({ version: n }: { version: number }) => version(n));
    const api = {
        versions: vi.fn(async () => [metadata(1), metadata(2), metadata(3)]),
        getVersion,
        restoreVersion,
        get: vi.fn(async () => null),
    } as unknown as GlobalsService;

    client.globals = api;
    adminConfig.globals[KEY] = CONFIG;

    const queryClient = createTestQueryClient();
    // No known users, so the page's author names need no request either.
    queryClient.setQueryData<QueryResult<User>>(queryKeys.users.list({ limit: 'all' }), {
        data: [],
        pagination: null,
    });

    const page = renderAdmin(<GlobalVersionsPage globalKey={KEY} locale="en" />, {
        url: `${BASE_PATH}/versions`,
        queryClient,
    });

    return { restoreVersion, getVersion, page };
}

describe('the global versions page', () => {
    it('lists the locale’s versions newest first', async () => {
        mountPage();

        // Each version is a button whose name leads with its number.
        const items = await screen.findAllByRole('button', { name: /^#\d/ });
        expect(items.map((item) => item.textContent?.slice(0, 2))).toEqual([
            '#3',
            '#2',
            '#1',
        ]);
    });

    it('reads the selected version and the one before it, and diffs them', async () => {
        const { getVersion } = mountPage();

        const values = await waitFor(() => {
            const found = [...document.querySelectorAll('.am-versions-diff-new')].map(
                (el) => el.textContent
            );
            if (found.length === 0) throw new Error('no diff rendered');
            return found;
        });
        expect(values).toEqual(['Tagline 3']);
        expect(getVersion).toHaveBeenCalledWith({ key: KEY, locale: 'en', version: 3 });
        expect(getVersion).toHaveBeenCalledWith({ key: KEY, locale: 'en', version: 2 });
    });

    it('restores the selected version by key, locale and number', async () => {
        const { restoreVersion, page } = mountPage();

        await page.user.click(
            await screen.findByRole('button', { name: 'Restore this version' })
        );

        // The restore is behind a confirmation.
        const dialog = await screen.findByRole('alertdialog');
        await page.user.click(within(dialog).getByRole('button', { name: 'Restore' }));

        await waitFor(() => {
            expect(restoreVersion).toHaveBeenCalledWith({
                key: KEY,
                locale: 'en',
                // The newest version is selected on load.
                version: 3,
            });
        });
    });
});
