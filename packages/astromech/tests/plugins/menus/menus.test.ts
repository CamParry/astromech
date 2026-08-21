/**
 * Tests for the @astromech/menus plugin:
 * - menus.get resolves entry refs to URLs
 * - menus.get honours locale
 * - menus.get skips disabled nodes
 * - menus.get preserves nesting
 * - menus.get falls back url → label-only
 * - generated pages/nav appear for each configured menu; none for unconfigured keys
 */

import type { AstromechConfig, JsonValue } from '@/types/index';
import type { MenuItem } from '@astromech/menus';
import { menus } from '@astromech/menus';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService } from '@/entries/index';
import { derivePluginNav, derivePluginPages } from '@/plugins/runtime/plugin-admin';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';
import { pluginServices } from '@/plugins/runtime/plugin-services';
import { settingsService } from '@/settings/index';

type MenusService = {
    get(input: { key: string; locale?: string }): Promise<MenuItem[] | null>;
};

function menusService(): MenusService {
    return pluginServices['menus'] as unknown as MenusService;
}

async function get(key: string, locale?: string): Promise<MenuItem[] | null> {
    if (locale !== undefined) {
        return menusService().get({ key, locale });
    }
    return menusService().get({ key });
}

async function writeSetting(key: string, value: unknown): Promise<void> {
    await settingsService.set({ key, value: value as JsonValue });
}

function makeMenusConfig(
    menuList = [{ key: 'main', label: 'Main Navigation' }]
): AstromechConfig {
    const base = makeTestConfig();
    // Add a url template to the post type so entry refs can resolve
    const post = base.entries['post'];
    if (post) post.url = '/blog/{slug}';
    return {
        ...base,
        plugins: [menus({ menus: menuList })],
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeMenusConfig());
});

describe('menus — plugin structure', () => {
    it('generates one settings page per configured menu', () => {
        const plugin = menus({
            menus: [
                { key: 'main', label: 'Main Nav' },
                { key: 'footer', label: 'Footer' },
            ],
        });
        const identity = resolvePluginIdentity(plugin);
        const pages = derivePluginPages(identity, plugin);
        expect(pages).toHaveLength(2);
        expect(pages[0]?.path).toBe('/menus/main');
        expect(pages[0]?.label).toBe('Main Nav');
        expect(pages[0]?.translatable).toBe(true);
        expect(pages[1]?.path).toBe('/menus/footer');
    });

    it('nav groups under a single Menus parent', () => {
        const plugin = menus({
            menus: [
                { key: 'main', label: 'Main Nav' },
                { key: 'footer', label: 'Footer' },
            ],
        });
        const identity = resolvePluginIdentity(plugin);
        const nav = derivePluginNav(identity, plugin);
        expect(nav).toHaveLength(1);
        const group = nav[0];
        expect(group?.label).toBe('Menus');
        expect(group?.children).toHaveLength(2);
        expect(group?.children?.[0]?.label).toBe('Main Nav');
        expect(group?.children?.[1]?.label).toBe('Footer');
    });

    it('generates no pages for unconfigured keys', () => {
        const plugin = menus({ menus: [{ key: 'main', label: 'Main Nav' }] });
        const identity = resolvePluginIdentity(plugin);
        const pages = derivePluginPages(identity, plugin);
        const paths = pages.map((p) => p.path);
        expect(paths).not.toContain('/menus/footer');
        expect(paths).not.toContain('/menus/sidebar');
    });

    it('settings pages have settings:read permission (from settings schema)', () => {
        const plugin = menus({ menus: [{ key: 'main', label: 'Main Nav' }] });
        const identity = resolvePluginIdentity(plugin);
        const pages = derivePluginPages(identity, plugin);
        expect(pages[0]?.permission).toBe('settings:read');
    });
});

describe('menus.get — unconfigured key', () => {
    it('returns null for a key not in the menus config', async () => {
        const result = await get('footer');
        expect(result).toBeNull();
    });
});

describe('menus.get — empty menu', () => {
    it('returns empty array when no blob is stored', async () => {
        const result = await get('main');
        expect(result).toEqual([]);
    });
});

describe('menus.get — basic items', () => {
    beforeEach(async () => {
        await writeSetting('plugin:menus:/menus/main', {
            items: [
                { _id: 'a1', label: 'Home', url: '/' },
                { _id: 'a2', label: 'Blog', url: '/blog' },
            ],
        });
    });

    it('returns items with label and url', async () => {
        const result = await get('main');
        expect(result).toEqual([
            { label: 'Home', url: '/' },
            { label: 'Blog', url: '/blog' },
        ]);
    });
});

describe('menus.get — disabled nodes', () => {
    beforeEach(async () => {
        await writeSetting('plugin:menus:/menus/main', {
            items: [
                { _id: 'b1', label: 'Active', url: '/active' },
                { _id: 'b2', label: 'Hidden', url: '/hidden', _disabled: true },
                { _id: 'b3', label: 'Also Active', url: '/also-active' },
            ],
        });
    });

    it('skips disabled nodes', async () => {
        const result = await get('main');
        expect(result).toHaveLength(2);
        expect(result?.map((i) => i.label)).toEqual(['Active', 'Also Active']);
    });
});

describe('menus.get — nesting', () => {
    beforeEach(async () => {
        await writeSetting('plugin:menus:/menus/main', {
            items: [
                {
                    _id: 'c1',
                    label: 'Products',
                    url: '/products',
                    _children: [
                        { _id: 'c2', label: 'Shoes', url: '/products/shoes' },
                        { _id: 'c3', label: 'Bags', url: '/products/bags' },
                    ],
                },
            ],
        });
    });

    it('preserves nesting structure', async () => {
        const result = await get('main');
        expect(result).toHaveLength(1);
        expect(result?.[0]?.label).toBe('Products');
        expect(result?.[0]?.children).toHaveLength(2);
        expect(result?.[0]?.children?.[0]?.label).toBe('Shoes');
        expect(result?.[0]?.children?.[1]?.label).toBe('Bags');
    });

    it('drops disabled children but keeps enabled siblings', async () => {
        await writeSetting('plugin:menus:/menus/main', {
            items: [
                {
                    _id: 'c1',
                    label: 'Products',
                    url: '/products',
                    _children: [
                        { _id: 'c2', label: 'Shoes', url: '/products/shoes' },
                        {
                            _id: 'c3',
                            label: 'Hidden',
                            url: '/products/hidden',
                            _disabled: true,
                        },
                    ],
                },
            ],
        });
        const result = await get('main');
        expect(result?.[0]?.children).toHaveLength(1);
        expect(result?.[0]?.children?.[0]?.label).toBe('Shoes');
    });
});

describe('menus.get — label-only node (no url, no entry)', () => {
    beforeEach(async () => {
        await writeSetting('plugin:menus:/menus/main', {
            items: [{ _id: 'd1', label: 'Section Header' }],
        });
    });

    it('returns node without url when neither url nor entry is set', async () => {
        const result = await get('main');
        expect(result).toHaveLength(1);
        expect(result?.[0]?.label).toBe('Section Header');
        expect(result?.[0]?.url).toBeUndefined();
    });
});

describe('menus.get — newTab flag', () => {
    beforeEach(async () => {
        await writeSetting('plugin:menus:/menus/main', {
            items: [
                { _id: 'e1', label: 'GitHub', url: 'https://github.com', newTab: true },
                { _id: 'e2', label: 'Home', url: '/' },
            ],
        });
    });

    it('carries newTab=true through', async () => {
        const result = await get('main');
        expect(result?.[0]?.newTab).toBe(true);
    });

    it('does not include newTab when false/absent', async () => {
        const result = await get('main');
        expect(result?.[1]?.newTab).toBeUndefined();
    });
});

describe('menus.get — locale', () => {
    beforeEach(async () => {
        // Shared (non-translatable) base
        await writeSetting('plugin:menus:/menus/main', {
            items: [{ _id: 'f1', label: 'Home', url: '/' }],
        });
        // Per-locale EN override
        await writeSetting('plugin:menus:/menus/main:en', {
            items: [{ _id: 'f1', label: 'Home', url: '/' }],
        });
        // Per-locale FR
        await writeSetting('plugin:menus:/menus/main:fr', {
            items: [{ _id: 'f1', label: 'Accueil', url: '/fr' }],
        });
    });

    it('reads FR locale blob when locale=fr', async () => {
        const result = await get('main', 'fr');
        // settings.get with locale merges base + locale-specific
        // The fr blob has Accueil
        expect(result?.[0]?.label).toBe('Accueil');
    });
});

describe('menus.get — entry ref resolution', () => {
    it('resolves an entry ref to its front-end URL', async () => {
        // Create a published post entry so it passes the public visibility filter
        const post = await entriesService.create({
            type: 'post',
            data: { title: 'Hello World', locale: 'en', status: 'published' },
        });

        await writeSetting('plugin:menus:/menus/main', {
            items: [{ _id: 'g1', label: 'A Post', entry: post.id }],
        });

        const result = await get('main', 'en');
        expect(result?.[0]?.label).toBe('A Post');
        // post type has url '/blog/{slug}' and slug is derived from title 'hello-world'
        expect(result?.[0]?.url).toBe('/blog/hello-world');
    });

    it('prefers entry url over url field when both are set', async () => {
        const post = await entriesService.create({
            type: 'post',
            data: { title: 'Override Test', locale: 'en', status: 'published' },
        });

        await writeSetting('plugin:menus:/menus/main', {
            items: [{ _id: 'h1', label: 'Post', entry: post.id, url: '/manual-url' }],
        });

        const result = await get('main', 'en');
        // entry takes precedence over url field
        expect(result?.[0]?.url).toBe('/blog/override-test');
    });
});
