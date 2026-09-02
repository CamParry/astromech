import type { ResolvedConfig } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { generateClientTypes } from '@/codegen/type-generator';

function makeConfig(
    globals: Record<string, object>,
    pluginGlobals: Record<string, Record<string, object>> = {}
): ResolvedConfig {
    return {
        entries: {
            posts: { fields: { main: [{ name: 'title', type: 'text' }], sidebar: [] } },
        },
        globals,
        pluginGlobals,
        pages: {},
        locales: [],
        defaultLocale: 'en',
        pluginEntries: {},
    } as unknown as ResolvedConfig;
}

const siteFields = {
    fields: {
        main: [{ name: 'tagline', type: 'text', required: true }],
        sidebar: [{ name: 'logo', type: 'media' }],
    },
};

describe('type-generator — globals', () => {
    it('emits an empty AstromechGlobalTypes interface when none are declared', () => {
        const output = generateClientTypes(makeConfig({}));

        expect(output).toContain('interface AstromechGlobalTypes {');
        expect(output).not.toContain('GlobalFields');
    });

    it('emits a fields type per host global and augments the map', () => {
        const output = generateClientTypes(makeConfig({ site: siteFields }));

        expect(output).toContain('// --- Global: site (SiteGlobal) ---');
        expect(output).toContain('export type SiteGlobalFields = {');
        expect(output).toContain('tagline: string;');
        expect(output).toContain('site: { fields: SiteGlobalFields };');
    });

    it('emits a fields type per plugin global, keyed by its qualified id', () => {
        const output = generateClientTypes(
            makeConfig({}, { seo: { settings: siteFields } })
        );

        expect(output).toContain(
            '// --- Plugin global: seo/settings (SeoSettingsGlobal) ---'
        );
        expect(output).toContain('export type SeoSettingsGlobalFields = {');
        expect(output).toContain('"seo/settings": { fields: SeoSettingsGlobalFields };');
    });

    it('types nested fields with the same machinery a collection uses', () => {
        const output = generateClientTypes(
            makeConfig({
                site: {
                    fields: {
                        main: [
                            {
                                name: 'nav',
                                type: 'tree',
                                fields: [{ name: 'label', type: 'text' }],
                            },
                        ],
                        sidebar: [],
                    },
                },
            })
        );

        expect(output).toContain('export type NavTreeNode = {');
        expect(output).toContain('nav?: NavTreeNode[];');
    });
});
