import { describe, expect, it } from 'vitest';
import { generatePluginClientManifest } from '@/codegen/plugin-client-manifest.js';
import type { PluginDefinition } from '@/types/plugins.js';

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
            {
                // Settings-only page: no component — must be excluded from pages export.
                path: '/settings',
                label: 'Settings',
                fields: [{ name: 'siteName', type: 'text' }],
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
        expect(result).toContain('namespace: "astromech-seo"');
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
        // bare `view` → `plugin:astromech-seo:view`
        expect(result).toContain('permission: "plugin:astromech-seo:view"');
    });

    it('excludes settings-only (no component) page from pages export', () => {
        const result = generatePluginClientManifest([seoPlugin]);
        // `/settings` has no component — should not appear in pages
        expect(result).not.toContain('"seo/settings"');
    });

    it('contains i18n export keyed by permissionNamespace', () => {
        const result = generatePluginClientManifest([seoPlugin]);
        expect(result).toContain('export const i18n = {');
        expect(result).toContain('"astromech-seo"');
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
