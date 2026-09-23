/**
 * The seo plugin's public `getSitemap` and `getMeta` methods and its `getOverview`
 * report, against a real database and the real plugin registration. Calls go
 * through `pluginServices`, which is trusted server code and skips `access`.
 */

import type { SeoOverview, SeoResolvedMeta, SeoSitemap } from '../../src/index';
import type {
    AstromechConfig,
    EntriesService,
    Entry,
    StorageDriver,
    StorageList,
} from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import {
    globalsService,
    entriesService as localEntries,
    mediaService,
} from '@/app-context/services';
import { pluginServices } from '@/plugins/runtime/plugin-services';
import { setStorageDriver } from '@/storage/registry';
import { seo, seoSection } from '../../src/index';

type SeoService = Record<string, (input?: unknown) => Promise<unknown>>;

function callSeo(method: string, input?: unknown): Promise<unknown> {
    const service = pluginServices['seo'] as unknown as SeoService | undefined;
    const fn = service?.[method];
    if (!fn) throw new Error(`seo.${method} not registered`);
    return fn(input);
}

const sitemap = (): Promise<SeoSitemap> => callSeo('getSitemap') as Promise<SeoSitemap>;

const meta = (type: string, slug: string): Promise<SeoResolvedMeta | null> =>
    callSeo('getMeta', { type, slug }) as Promise<SeoResolvedMeta | null>;

const overview = (): Promise<SeoOverview> =>
    callSeo('getOverview') as Promise<SeoOverview>;

/** The one entries service, typed to the wide API for these round-trips. */
const entries = (): EntriesService => localEntries as unknown as EntriesService;

/** Accepts every write and serves nothing back; the upload only needs a put. */
const storage: StorageDriver = {
    name: 'test-write-only',
    async put(): Promise<void> {
        return undefined;
    },
    async get(): Promise<null> {
        return null;
    },
    async stat(): Promise<null> {
        return null;
    },
    async delete(): Promise<void> {
        return undefined;
    },
    async list(): Promise<StorageList> {
        return { keys: [] };
    },
    getPublicUrl: (key: string): string => `/media/${key}`,
};

/**
 * The harness config with the seo section on `post` (url `postUrl`) and on
 * `note` (no url template). `bookmark` gets a url template but no seo field,
 * so it sits outside the plugin's footprint.
 */
function configWithSeo(postUrl = '/blog/{slug}'): AstromechConfig {
    const base = makeTestConfig();
    const { post, note, bookmark } = base.entries;
    if (!post || !note || !bookmark) {
        throw new Error('test harness is missing an entry type');
    }
    if (!Array.isArray(post.fields) || !Array.isArray(note.fields)) {
        throw new Error('test harness post and note fields are not flat lists');
    }
    return {
        ...base,
        entries: {
            ...base.entries,
            post: {
                ...post,
                url: postUrl,
                fields: [...post.fields, seoSection()],
            },
            note: { ...note, fields: [...note.fields, seoSection()] },
            bookmark: { ...bookmark, url: '/bookmarks/{slug}' },
        },
        plugins: [seo()],
    };
}

async function createEntry(
    type: string,
    data: {
        title: string;
        status: 'published' | 'unpublished';
        seo?: { title?: string; description?: string };
    }
): Promise<Entry> {
    return entries().create({
        type,
        data: {
            title: data.title,
            status: data.status,
            fields: data.seo ? { seo: data.seo } : {},
        },
    });
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(configWithSeo());
    setStorageDriver(storage);
});

describe('seo sitemap', () => {
    it('lists a published entry at its url template path, last updated as lastmod', async () => {
        const entry = await createEntry('post', { title: 'Hello', status: 'published' });

        expect((await sitemap()).urls).toEqual([
            { loc: '/blog/hello', lastmod: new Date(entry.updatedAt).toISOString() },
        ]);
    });

    it('leaves out unpublished entries', async () => {
        await createEntry('post', { title: 'Unpublished', status: 'unpublished' });

        expect((await sitemap()).urls).toEqual([]);
    });

    it('leaves out trashed entries', async () => {
        const entry = await createEntry('post', { title: 'Gone', status: 'published' });
        await entries().trash({ type: 'post', id: entry.id });

        expect((await sitemap()).urls).toEqual([]);
    });

    it('leaves out a type with no url template', async () => {
        await createEntry('note', { title: 'Note', status: 'published' });

        expect((await sitemap()).urls).toEqual([]);
    });

    it('leaves out an entry whose url template names an empty field', async () => {
        setupTestConfig(configWithSeo('/{category}/{slug}'));
        await createEntry('post', { title: 'Hello', status: 'published' });

        expect((await sitemap()).urls).toEqual([]);
    });

    it('leaves out a type without the seo field', async () => {
        await createEntry('bookmark', { title: 'Bookmark', status: 'published' });

        expect((await sitemap()).urls).toEqual([]);
    });
});

describe('seo meta', () => {
    it('resolves the seo title and description with the entry path', async () => {
        await createEntry('post', {
            title: 'Hello',
            status: 'published',
            seo: { title: 'Search title', description: 'Search description' },
        });

        expect(await meta('post', 'hello')).toEqual({
            title: 'Search title',
            description: 'Search description',
            ogImage: null,
            path: '/blog/hello',
        });
    });

    it('falls back to the entry title and no description when the seo values are blank', async () => {
        await createEntry('post', {
            title: 'Hello',
            status: 'published',
            seo: { title: '   ', description: ' ' },
        });

        expect(await meta('post', 'hello')).toMatchObject({
            title: 'Hello',
            description: null,
        });
    });

    it('falls back to the entry title when the entry has no seo value', async () => {
        await createEntry('post', { title: 'Hello', status: 'published' });

        expect(await meta('post', 'hello')).toMatchObject({
            title: 'Hello',
            description: null,
        });
    });

    it('resolves the default Open Graph image from the settings global', async () => {
        const image = await mediaService.upload({
            file: new File(['not really an image'], 'share.txt', { type: 'text/plain' }),
        });
        await globalsService.update({
            key: 'seo/settings',
            data: { fields: { defaultOgImage: image.id } },
        });
        await createEntry('post', { title: 'Hello', status: 'published' });

        const resolved = await meta('post', 'hello');

        expect(image.url).toBeTruthy();
        expect(resolved?.ogImage).toBe(image.url);
    });

    it('resolves a null path for a type with no url template', async () => {
        await createEntry('note', { title: 'Note', status: 'published' });

        expect(await meta('note', 'note')).toMatchObject({ title: 'Note', path: null });
    });

    it('resolves a null path for an entry whose url template names an empty field', async () => {
        setupTestConfig(configWithSeo('/{category}/{slug}'));
        await createEntry('post', { title: 'Hello', status: 'published' });

        expect(await meta('post', 'hello')).toMatchObject({ title: 'Hello', path: null });
    });

    it('resolves null for an unpublished entry, an unknown slug, or a type outside the footprint', async () => {
        await createEntry('post', { title: 'Unpublished', status: 'unpublished' });
        await createEntry('bookmark', { title: 'Bookmark', status: 'published' });

        expect(await meta('post', 'unpublished')).toBeNull();
        expect(await meta('post', 'missing')).toBeNull();
        expect(await meta('bookmark', 'bookmark')).toBeNull();
        expect(await meta('unknown', 'anything')).toBeNull();
    });
});

describe('seo overview', () => {
    it('grades every entry in the footprint, unpublished ones included, and counts the complete ones', async () => {
        const complete = await createEntry('post', {
            title: 'Complete',
            status: 'published',
            seo: { title: 'T'.repeat(40), description: 'D'.repeat(100) },
        });
        const unpublished = await createEntry('post', {
            title: 'Unpublished',
            status: 'unpublished',
        });
        const note = await createEntry('note', {
            title: 'Note',
            status: 'published',
            seo: { title: 'Short', description: 'D'.repeat(200) },
        });
        await createEntry('bookmark', { title: 'Outside', status: 'published' });

        const report = await overview();

        expect(report.totals).toEqual({ entries: 3, complete: 1, needsAttention: 2 });
        expect(report.items).toHaveLength(3);
        expect(report.items.find((item) => item.id === complete.id)).toEqual({
            id: complete.id,
            type: 'post',
            title: 'Complete',
            slug: 'complete',
            entryStatus: 'published',
            metaTitle: { length: 40, status: 'good' },
            metaDescription: { length: 100, status: 'good' },
        });
        expect(report.items.find((item) => item.id === unpublished.id)).toMatchObject({
            entryStatus: 'unpublished',
            metaTitle: { length: 0, status: 'empty' },
            metaDescription: { length: 0, status: 'empty' },
        });
        expect(report.items.find((item) => item.id === note.id)).toMatchObject({
            type: 'note',
            metaTitle: { length: 5, status: 'short' },
            metaDescription: { length: 200, status: 'long' },
        });
    });

    it('reports zero totals when the footprint holds no entries', async () => {
        expect(await overview()).toEqual({
            totals: { entries: 0, complete: 0, needsAttention: 0 },
            items: [],
        });
    });
});
