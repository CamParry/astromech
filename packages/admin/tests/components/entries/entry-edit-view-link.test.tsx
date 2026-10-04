/**
 * @vitest-environment happy-dom
 *
 * The entry edit page's "View live page" link carries the locale prefix of a
 * locale other than the default content locale, which the admin resolves from
 * its display locale down the fallback chain, as core does.
 */

import type { AdminEntryType, EntriesService, Entry, EntryStatus } from '@/types/index';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntryEditPage } from '@/admin/components/entries/entry-edit-page';
import { renderAdmin } from '../../_support/render-admin';

// `fr` comes first, so only the fallback chain from `en-GB` makes `en` the default.
const { adminConfig } = vi.hoisted(() => ({
    adminConfig: {
        defaultLocale: 'en-GB',
        locales: ['fr', 'en'],
        entryTypes: {} as Record<string, unknown>,
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

const { queryUsers, client } = vi.hoisted(() => ({
    queryUsers: vi.fn(),
    client: { entries: undefined as unknown },
}));

vi.mock('astromech/fetch', () => ({
    astromechUntypedClient: {
        users: { query: queryUsers },
        get entries() {
            return client.entries;
        },
    },
}));

afterEach(() => {
    queryUsers.mockReset();
});

const TYPE = 'post';
const ID = 'p1';

const ENTRY_TYPE_CONFIG: AdminEntryType = {
    single: 'Post',
    plural: 'Posts',
    versioning: false,
    translatable: true,
    slug: null,
    adminColumns: [],
    fields: { main: [], sidebar: [] },
    url: '/blog/{slug}',
    capabilities: {
        statuses: true,
        slug: true,
        translatable: true,
        versioning: false,
        staging: false,
        trash: true,
    },
    titleField: 'title',
};

function mountPage(locale: string, slug: string): void {
    const entry = {
        id: ID,
        type: TYPE,
        locale,
        slug,
        title: 'A post',
        status: 'published' as EntryStatus,
        locales: ['fr', 'en'],
        fields: {},
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
    } as unknown as Entry;
    client.entries = {
        get: vi.fn(async () => entry),
        update: vi.fn(),
    } as unknown as EntriesService;
    queryUsers.mockResolvedValue({ data: [] });
    adminConfig.entryTypes[TYPE] = ENTRY_TYPE_CONFIG;

    renderAdmin(<EntryEditPage type={TYPE} id={ID} locale={locale} />, {
        url: `/entries/${TYPE}/${ID}?locale=${locale}`,
    });
}

describe('the entry edit page View link', () => {
    it.each([
        ['prefixes a locale other than the default', 'fr', 'bonjour', '/fr/blog/bonjour'],
        ['leaves the default content locale unprefixed', 'en', 'hello', '/blog/hello'],
    ])('%s', async (_, locale, slug, href) => {
        mountPage(locale, slug);

        const link = await screen.findByRole('link', { name: 'View live page' });

        expect(link.getAttribute('href')).toBe(href);
    });
});
