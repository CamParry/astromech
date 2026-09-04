/**
 * Tests for the @astromech/menus plugin:
 * - menus.get resolves entry refs to URLs
 * - menus.get honours locale
 * - menus.get skips disabled nodes
 * - menus.get preserves nesting
 * - menus.get falls back url → label-only
 * - a global and a nav item appear for each configured menu; none for unconfigured keys
 */

import type { AstromechConfig, JsonObject, PluginDefinition } from '@/types/index';
import type { MenuItem } from '@astromech/menus';
import { menus } from '@astromech/menus';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService } from '@/entries/service';
import { globalsService } from '@/globals/service';
import { derivePluginNav } from '@/plugins/runtime/plugin-admin';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';
import { pluginServices } from '@/plugins/runtime/plugin-services';

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

/** Write and publish one locale of a menu's global, as the admin does. */
async function writeMenu(key: string, items: unknown[], locale?: string): Promise<void> {
    const address = {
        key: `menus/menu-${key}`,
        ...(locale === undefined ? {} : { locale }),
    };
    await globalsService.update({
        ...address,
        data: { fields: { items } as JsonObject },
    });
    await globalsService.publish(address);
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
    it('declares one global per configured menu', () => {
        const plugin = menus({
            menus: [
                { key: 'main', label: 'Main Nav' },
                { key: 'footer', label: 'Footer' },
            ],
        });
        const globals = plugin.globals ?? [];
        expect(globals).toHaveLength(2);
        expect(globals[0]?.key).toBe('menu-main');
        expect(globals[0]?.label).toBe('Main Nav');
        expect(globals[0]?.translatable).toBe(true);
        expect(globals[1]?.key).toBe('menu-footer');
    });

    it('nav groups under a single Menus parent, gated per global', () => {
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
        expect(group?.children?.[0]?.permission).toBe(
            'plugin:menus:global:menu-main:read'
        );
        expect(group?.children?.[1]?.label).toBe('Footer');
    });

    it('declares no global for an unconfigured key', () => {
        const plugin = menus({ menus: [{ key: 'main', label: 'Main Nav' }] });
        const keys = (plugin.globals ?? []).map((global) => global.key);
        expect(keys).not.toContain('menu-footer');
        expect(keys).not.toContain('menu-sidebar');
    });

    it('declares no admin pages', () => {
        const plugin: PluginDefinition = menus({
            menus: [{ key: 'main', label: 'Main Nav' }],
        });
        expect(plugin.admin?.pages ?? []).toEqual([]);
    });
});

describe('menus.get — unconfigured key', () => {
    it('returns null for a key not in the menus config', async () => {
        const result = await get('footer');
        expect(result).toBeNull();
    });
});

describe('menus.get — empty menu', () => {
    it('returns empty array when nothing is stored', async () => {
        const result = await get('main');
        expect(result).toEqual([]);
    });
});

describe('menus.get — basic items', () => {
    beforeEach(async () => {
        await writeMenu('main', [
            { _id: 'a1', label: 'Home', url: '/' },
            { _id: 'a2', label: 'Blog', url: '/blog' },
        ]);
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
        await writeMenu('main', [
            { _id: 'b1', label: 'Active', url: '/active' },
            { _id: 'b2', label: 'Hidden', url: '/hidden', _disabled: true },
            { _id: 'b3', label: 'Also Active', url: '/also-active' },
        ]);
    });

    it('skips disabled nodes', async () => {
        const result = await get('main');
        expect(result).toHaveLength(2);
        expect(result?.map((i) => i.label)).toEqual(['Active', 'Also Active']);
    });
});

describe('menus.get — nesting', () => {
    beforeEach(async () => {
        await writeMenu('main', [
            {
                _id: 'c1',
                label: 'Products',
                url: '/products',
                _children: [
                    { _id: 'c2', label: 'Shoes', url: '/products/shoes' },
                    { _id: 'c3', label: 'Bags', url: '/products/bags' },
                ],
            },
        ]);
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
        await writeMenu('main', [
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
        ]);
        const result = await get('main');
        expect(result?.[0]?.children).toHaveLength(1);
        expect(result?.[0]?.children?.[0]?.label).toBe('Shoes');
    });
});

describe('menus.get — label-only node (no url, no entry)', () => {
    beforeEach(async () => {
        await writeMenu('main', [{ _id: 'd1', label: 'Section Header' }]);
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
        await writeMenu('main', [
            { _id: 'e1', label: 'GitHub', url: 'https://github.com', newTab: true },
            { _id: 'e2', label: 'Home', url: '/' },
        ]);
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
        // `items` is translatable, so each locale carries its own tree.
        await writeMenu('main', [{ _id: 'f1', label: 'Home', url: '/' }], 'en');
        await writeMenu('main', [{ _id: 'f1', label: 'Startseite', url: '/de' }], 'de');
    });

    it('reads the de row when locale=de', async () => {
        const result = await get('main', 'de');
        expect(result?.[0]?.label).toBe('Startseite');
    });

    it('reads the default locale row when no locale is given', async () => {
        const result = await get('main');
        expect(result?.[0]?.label).toBe('Home');
    });
});

describe('menus.get — entry ref resolution', () => {
    it('resolves an entry ref to its front-end URL', async () => {
        // Create a published post entry so it passes the public visibility filter
        const post = await entriesService.create({
            type: 'post',
            data: { title: 'Hello World', locale: 'en', status: 'published' },
        });

        await writeMenu('main', [{ _id: 'g1', label: 'A Post', entry: post.id }]);

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

        await writeMenu('main', [
            { _id: 'h1', label: 'Post', entry: post.id, url: '/manual-url' },
        ]);

        const result = await get('main', 'en');
        // entry takes precedence over url field
        expect(result?.[0]?.url).toBe('/blog/override-test');
    });
});
