import type { AdminPage } from '@/types/config';
import type { PluginDefinition } from '@/types/plugins';
import { describe, expect, it } from 'vitest';
import { generatePluginClientManifest } from '@/codegen/plugin-client-manifest';

const seoPlugin: PluginDefinition = {
    package: '@astromech/seo',
    fields: [
        {
            type: 'seo-preview',
            component: '@astromech/seo/fields/SeoPreview',
            defaultValue: { title: '', description: '' },
        },
    ],
    admin: {
        pages: [
            {
                path: '/overview',
                label: 'Overview',
                component: '@astromech/seo/pages/Overview',
                permission: 'view',
            },
        ],
    },
    i18n: {
        en: '@astromech/seo/locales/en.json',
        fr: '@astromech/seo/locales/fr.json',
    },
};

describe('generatePluginClientManifest', () => {
    it('produces a non-empty string', () => {
        const result = generatePluginClientManifest([seoPlugin]);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    it('contains fieldTypes export with the registered field type', () => {
        const result = generatePluginClientManifest([seoPlugin]);
        expect(result).toContain('export const fieldTypes = {');
        expect(result).toContain('"seo-preview"');
        expect(result).toContain('import("@astromech/seo/fields/SeoPreview")');
        // generated source uses unquoted property names
        expect(result).toContain('plugin: "seo"');
        expect(result).toContain('namespace: "seo"');
    });

    it('includes defaultValue in field type entry', () => {
        const result = generatePluginClientManifest([seoPlugin]);
        expect(result).toContain('defaultValue: {"title":"","description":""}');
    });

    it('uses null as defaultValue when absent', () => {
        const plugin: PluginDefinition = {
            package: '@test/plugin',
            fields: [{ type: 'my-field', component: '@test/plugin/MyField' }],
        };
        const result = generatePluginClientManifest([plugin]);
        expect(result).toContain('defaultValue: null');
    });

    it('contains pages export keyed {name}{path} for component pages', () => {
        const result = generatePluginClientManifest([seoPlugin]);
        expect(result).toContain('export const pages = {');
        // key is `seo/overview`
        expect(result).toContain('"seo/overview"');
        expect(result).toContain('import("@astromech/seo/pages/Overview")');
    });

    it('resolves permission with plugin namespace for bare permission key', () => {
        const result = generatePluginClientManifest([seoPlugin]);
        // bare `view` → `plugin:seo:view`
        expect(result).toContain('permission: "plugin:seo:view"');
    });

    it('contains i18n export keyed by permissionNamespace', () => {
        const result = generatePluginClientManifest([seoPlugin]);
        expect(result).toContain('export const i18n = {');
        expect(result).toContain('"seo"');
        expect(result).toContain('import("@astromech/seo/locales/en.json")');
        expect(result).toContain('import("@astromech/seo/locales/fr.json")');
    });

    it('produces empty blocks for a plugin with no fields, pages, or i18n', () => {
        const bare: PluginDefinition = { package: '@test/bare' };
        const result = generatePluginClientManifest([bare]);
        expect(result).toContain('export const fieldTypes = {');
        expect(result).toContain('export const pages = {');
        expect(result).toContain('export const i18n = {');
    });

    it('returns empty blocks when plugins array is empty', () => {
        const result = generatePluginClientManifest([]);
        expect(result).toContain('export const fieldTypes = {\n\n};');
        expect(result).toContain('export const pages = {\n\n};');
        expect(result).toContain('export const i18n = {\n\n};');
    });
});

describe('generatePluginClientManifest — host pages', () => {
    const root = 'file:///repo/apps/demo/';

    const hostPage = (overrides: Partial<AdminPage> = {}): AdminPage => ({
        path: 'site-status',
        label: 'Site Status',
        component: './src/admin/pages/site-status.tsx',
        ...overrides,
    });

    it('always emits hostPages, even with no host arg', () => {
        const result = generatePluginClientManifest([seoPlugin]);
        expect(result).toContain('export const hostPages = {\n\n};');
    });

    it('emits an empty hostPages block when the host has no pages', () => {
        const result = generatePluginClientManifest([], { pages: [], root });
        expect(result).toContain('export const hostPages = {\n\n};');
    });

    it('keys the entry by path and resolves a relative specifier against root', () => {
        const result = generatePluginClientManifest([], { pages: [hostPage()], root });
        expect(result).toContain('"site-status"');
        expect(result).toContain(
            'import("/repo/apps/demo/src/admin/pages/site-status.tsx")'
        );
    });

    it('passes a bare package specifier through untouched', () => {
        const result = generatePluginClientManifest([], {
            pages: [hostPage({ component: '@acme/widgets/StatusPage' })],
            root,
        });
        expect(result).toContain('import("@acme/widgets/StatusPage")');
    });

    it('emits permission: null by default and the raw key when set', () => {
        const bare = generatePluginClientManifest([], { pages: [hostPage()], root });
        expect(bare).toContain(
            '"site-status": { load: () => import("/repo/apps/demo/src/admin/pages/site-status.tsx"), permission: null, label: "Site Status" },'
        );

        const guarded = generatePluginClientManifest([], {
            pages: [hostPage({ permission: 'users:read' })],
            root,
        });
        expect(guarded).toContain('permission: "users:read"');
    });

    it('emits an empty hostPages export when no host pages are declared', () => {
        const result = generatePluginClientManifest([], { pages: [], root });
        expect(result).toContain('export const hostPages = {\n\n};');
    });
});

describe('generatePluginClientManifest — slots', () => {
    const slotPlugin: PluginDefinition = {
        package: '@astromech/foo',
        admin: {
            slots: [
                {
                    slot: 'toolbar',
                    component: '@astromech/foo/slots/ToolbarWidget',
                    permission: 'manage',
                },
                {
                    slot: 'global-overlay',
                    component: '@astromech/foo/slots/Overlay',
                },
            ],
        },
    };

    it('emits export const slots = { with all three slot keys', () => {
        const result = generatePluginClientManifest([slotPlugin]);
        expect(result).toContain('export const slots = {');
        expect(result).toContain('"global-overlay"');
        expect(result).toContain('"right-drawer"');
        expect(result).toContain('"toolbar"');
    });

    it('places contributions under the correct slot', () => {
        const result = generatePluginClientManifest([slotPlugin]);
        expect(result).toContain('import("@astromech/foo/slots/ToolbarWidget")');
        expect(result).toContain('import("@astromech/foo/slots/Overlay")');
    });

    it('resolves namespaced permission from bare key', () => {
        const result = generatePluginClientManifest([slotPlugin]);
        // `@astromech/foo` strips the first-party scope → namespace "foo"
        expect(result).toContain('permission: "plugin:foo:manage"');
    });

    it('emits permission: null when permission is omitted', () => {
        const result = generatePluginClientManifest([slotPlugin]);
        expect(result).toContain('permission: null');
    });

    it('defaults id to ${name}:${slot}:${index}', () => {
        const result = generatePluginClientManifest([slotPlugin]);
        expect(result).toContain('id: "foo:toolbar:0"');
        expect(result).toContain('id: "foo:global-overlay:1"');
    });

    it('uses provided id when specified', () => {
        const plugin: PluginDefinition = {
            package: '@test/plugin',
            admin: {
                slots: [
                    {
                        slot: 'toolbar',
                        component: '@test/plugin/ToolbarWidget',
                        id: 'my-custom-id',
                    },
                ],
            },
        };
        const result = generatePluginClientManifest([plugin]);
        expect(result).toContain('id: "my-custom-id"');
    });

    it('sorts contributions within the same slot by order ascending', () => {
        const plugin: PluginDefinition = {
            package: '@test/order',
            admin: {
                slots: [
                    {
                        slot: 'toolbar',
                        component: '@test/order/Second',
                        order: 2,
                    },
                    {
                        slot: 'toolbar',
                        component: '@test/order/First',
                        order: 1,
                    },
                ],
            },
        };
        const result = generatePluginClientManifest([plugin]);
        const idxFirst = result.indexOf('import("@test/order/First")');
        const idxSecond = result.indexOf('import("@test/order/Second")');
        expect(idxFirst).toBeLessThan(idxSecond);
    });

    it('throws for an unknown slot name', () => {
        const plugin: PluginDefinition = {
            package: '@test/bad',
            admin: {
                // cast to bypass TS — simulate a runtime authoring mistake
                slots: [{ slot: 'unknown-slot' as 'toolbar', component: '@test/bad/X' }],
            },
        };
        expect(() => generatePluginClientManifest([plugin])).toThrow(
            'unknown admin slot "unknown-slot"'
        );
    });

    it('produces empty arrays for all slots when no plugin declares any', () => {
        const bare: PluginDefinition = { package: '@test/bare' };
        const result = generatePluginClientManifest([bare]);
        // Each slot block should have an empty array
        expect(result).toContain('"global-overlay": [\n\n\t],');
        expect(result).toContain('"right-drawer": [\n\n\t],');
        expect(result).toContain('"toolbar": [\n\n\t],');
    });
});
