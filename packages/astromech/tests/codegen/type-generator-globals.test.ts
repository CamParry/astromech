import type { GlobalConfig, PluginDefinition, ResolvedConfig } from '@/types/index';
import { resolveTestConfig } from '@tests/harness';
import { describe, expect, it } from 'vitest';
import { generateClientTypes } from '@/codegen/type-generator';

/** A config with one entry type, the host `globals` and the `plugins`. */
function makeConfig(
    globals: GlobalConfig[],
    plugins: PluginDefinition[] = []
): ResolvedConfig {
    return resolveTestConfig({
        entries: {
            posts: {
                single: 'Post',
                plural: 'Posts',
                fields: [{ name: 'title', type: 'text' }],
            },
        },
        globals,
        plugins,
    });
}

/** A global named `key` with a required tagline in main and a logo in the sidebar. */
function siteGlobal(key: string): GlobalConfig {
    return {
        key,
        label: 'Site',
        fields: {
            main: [{ name: 'tagline', type: 'text', required: true }],
            sidebar: [{ name: 'logo', type: 'media' }],
        },
    };
}

describe('type-generator — globals', () => {
    it('emits an empty AstromechGlobalTypes interface when none are declared', () => {
        const output = generateClientTypes(makeConfig([]));

        expect(output).toContain('interface AstromechGlobalTypes {');
        expect(output).not.toContain('GlobalFields');
    });

    it('emits a fields type per host global and augments the map', () => {
        const output = generateClientTypes(makeConfig([siteGlobal('site')]));

        expect(output).toContain('// --- Global: site (SiteGlobal) ---');
        expect(output).toContain('export type SiteGlobalFields = {');
        expect(output).toContain('tagline: string;');
        expect(output).toContain('site: { fields: SiteGlobalFields };');
    });

    it('emits a fields type per plugin global, keyed by its qualified id', () => {
        const output = generateClientTypes(
            makeConfig(
                [],
                [{ package: '@astromech/seo', globals: [siteGlobal('settings')] }]
            )
        );

        expect(output).toContain('// --- Global: seo/settings (SeoSettingsGlobal) ---');
        expect(output).toContain('export type SeoSettingsGlobalFields = {');
        expect(output).toContain('"seo/settings": { fields: SeoSettingsGlobalFields };');
    });

    it('types nested fields with the same machinery a collection uses', () => {
        const output = generateClientTypes(
            makeConfig([
                {
                    key: 'site',
                    label: 'Site',
                    fields: [
                        {
                            name: 'nav',
                            type: 'tree',
                            fields: [{ name: 'label', type: 'text' }],
                        },
                    ],
                },
            ])
        );

        expect(output).toContain('export type SiteGlobalNavTreeNode = {');
        expect(output).toContain('nav?: SiteGlobalNavTreeNode[];');
    });
});
