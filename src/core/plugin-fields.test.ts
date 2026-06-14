import { describe, expect, it } from 'vitest';
import type { PluginDefinition } from '@/types/index.js';
import {
    assertNoFieldTypeCollisions,
    collectPluginFieldTypes,
} from '@/core/plugin-fields.js';
import { generateSdkTypes } from '@/core/type-generator.js';
import type { ResolvedConfig } from '@/types/index.js';

const def = (
    partial: Partial<PluginDefinition> & { package: string }
): PluginDefinition => ({
    ...partial,
});

describe('assertNoFieldTypeCollisions', () => {
    it('passes for unique custom types', () => {
        expect(() =>
            assertNoFieldTypeCollisions([
                def({
                    package: '@a/seo',
                    fields: [{ type: 'seo-meta', component: '@a/seo/field' }],
                }),
                def({
                    package: '@b/forms',
                    fields: [{ type: 'form-builder', component: '@b/forms/field' }],
                }),
            ])
        ).not.toThrow();
    });

    it('throws when a plugin shadows a core field type', () => {
        expect(() =>
            assertNoFieldTypeCollisions([
                def({
                    package: '@a/seo',
                    fields: [{ type: 'richtext', component: '@a/seo/field' }],
                }),
            ])
        ).toThrow(/core field type/i);
    });

    it('throws when two plugins register the same type', () => {
        expect(() =>
            assertNoFieldTypeCollisions([
                def({
                    package: '@a/seo',
                    fields: [{ type: 'meta', component: '@a/seo/field' }],
                }),
                def({
                    package: '@b/other',
                    fields: [{ type: 'meta', component: '@b/other/field' }],
                }),
            ])
        ).toThrow(/collision.*meta/i);
    });
});

describe('collectPluginFieldTypes', () => {
    it('maps registrations by field type', () => {
        const map = collectPluginFieldTypes([
            def({
                package: '@a/seo',
                fields: [
                    { type: 'seo-meta', component: '@a/seo/field', defaultValue: {} },
                ],
            }),
        ]);
        expect(map.get('seo-meta')?.component).toBe('@a/seo/field');
    });
});

describe('generateSdkTypes with plugin field types', () => {
    const config = {
        adminRoute: '/admin',
        apiRoute: '/api',
        entries: {
            posts: {
                single: 'Post',
                plural: 'Posts',
                fields: {
                    main: [{ name: 'seo', type: 'seo-meta' }],
                    sidebar: [],
                },
            },
        },
        trash: { enabled: true, retentionDays: 30 },
    } as unknown as ResolvedConfig;

    it('uses the registration typeGen when provided', () => {
        const output = generateSdkTypes(
            config,
            collectPluginFieldTypes([
                def({
                    package: '@a/seo',
                    fields: [
                        {
                            type: 'seo-meta',
                            component: '@a/seo/field',
                            typeGen: () => '{ title: string; description: string }',
                        },
                    ],
                }),
            ])
        );
        expect(output).toContain('seo?: { title: string; description: string };');
    });

    it('falls back to JsonValue without typeGen', () => {
        const output = generateSdkTypes(
            config,
            collectPluginFieldTypes([
                def({
                    package: '@a/seo',
                    fields: [{ type: 'seo-meta', component: '@a/seo/field' }],
                }),
            ])
        );
        expect(output).toContain("seo?: import('astromech').JsonValue;");
    });

    it('skips unknown field types entirely without a registration', () => {
        const output = generateSdkTypes(config);
        expect(output).not.toContain('seo?:');
    });

    it('emits hook-event augmentations (SDK lines no longer generated)', () => {
        const output = generateSdkTypes(config, new Map(), [
            def({
                package: '@astromech/redirects',
                sdk: { lookup: { access: 'public', handler: async () => null } },
                hookEvents: ['redirects:resolved'],
            }),
        ]);
        expect(output).toContain("'redirects:resolved': unknown;");
        expect(output).not.toContain('lookup(');
    });

    it('omits the plugin augmentation block when no plugin contributes', () => {
        const output = generateSdkTypes(config, new Map(), [def({ package: '@a/b' })]);
        expect(output).not.toContain('AstromechPluginSdks');
    });
});

// ============================================================================
// Plugin entry typegen
// ============================================================================

describe('generateSdkTypes — plugin entry types', () => {
    const baseConfig = {
        adminRoute: '/admin',
        apiRoute: '/api',
        entries: {
            posts: {
                single: 'Post',
                plural: 'Posts',
                fields: { main: [], sidebar: [] },
            },
        },
        pluginEntries: {},
        trash: { enabled: true, retentionDays: 30 },
    } as unknown as ResolvedConfig;

    const redirectFields = {
        main: [
            {
                name: 'from',
                type: 'text' as const,
                label: 'From',
                required: true as const,
            },
            {
                name: 'to',
                type: 'text' as const,
                label: 'To',
                required: true as const,
            },
            {
                name: 'status',
                type: 'select' as const,
                label: 'Type',
                options: ['301', '302'],
            },
            { name: 'enabled', type: 'boolean' as const, label: 'Enabled' },
        ],
        sidebar: [],
    };

    const configWithPluginEntries = {
        ...baseConfig,
        pluginEntries: {
            redirects: {
                redirect: {
                    single: 'Redirect',
                    plural: 'Redirects',
                    fields: redirectFields,
                },
            },
        },
    } as unknown as ResolvedConfig;

    it('generates PluginRedirectsRedirectFields interface', () => {
        const output = generateSdkTypes(configWithPluginEntries);
        expect(output).toContain('export interface PluginRedirectsRedirectFields {');
        expect(output).toContain('from: string;');
        expect(output).toContain('to: string;');
        expect(output).toContain('status?: string;');
        expect(output).toContain('enabled?: boolean;');
    });

    it('generates PluginRedirectsRedirectRelations type', () => {
        const output = generateSdkTypes(configWithPluginEntries);
        expect(output).toContain('export type PluginRedirectsRedirectRelations =');
    });

    it('augments AstromechPluginEntryTypes with the redirects plugin block', () => {
        const output = generateSdkTypes(configWithPluginEntries);
        expect(output).toContain('interface AstromechPluginEntryTypes {');
        expect(output).toContain('redirects: {');
        expect(output).toContain(
            'redirect: { fields: PluginRedirectsRedirectFields; relations: PluginRedirectsRedirectRelations };'
        );
    });

    it('uses plugin entry prefix comment marker', () => {
        const output = generateSdkTypes(configWithPluginEntries);
        expect(output).toContain(
            '// --- Plugin entry: redirects/redirect (PluginRedirectsRedirect) ---'
        );
    });

    it('resolves qualified relation target to plugin Fields interface', () => {
        const configWithRelation = {
            ...configWithPluginEntries,
            entries: {
                posts: {
                    single: 'Post',
                    plural: 'Posts',
                    fields: {
                        main: [
                            {
                                name: 'related_redirect',
                                type: 'relationship',
                                target: 'redirects/redirect',
                                label: 'Related Redirect',
                            },
                        ],
                        sidebar: [],
                    },
                },
            },
        } as unknown as ResolvedConfig;

        const output = generateSdkTypes(configWithRelation);
        expect(output).toContain(
            "import('astromech').TypedEntry<PluginRedirectsRedirectFields>"
        );
    });

    it('produces no AstromechPluginEntryTypes augmentation when pluginEntries is empty', () => {
        const output = generateSdkTypes(baseConfig);
        const hasEmptyBlock = output.includes(
            'interface AstromechPluginEntryTypes {\n  }'
        );
        expect(hasEmptyBlock).toBe(false);
    });

    it('empty pluginEntries produces output identical to baseline (regression)', () => {
        const baseline = generateSdkTypes(baseConfig);
        const withEmpty = generateSdkTypes({
            ...baseConfig,
            pluginEntries: {},
        } as unknown as ResolvedConfig);
        expect(withEmpty).toBe(baseline);
    });

    it('quotes non-identifier plugin/type keys in augmentation', () => {
        const configWithHyphenated = {
            ...baseConfig,
            pluginEntries: {
                'my-plugin': {
                    'some-type': {
                        single: 'Some Type',
                        plural: 'Some Types',
                        fields: {
                            main: [
                                {
                                    name: 'title',
                                    type: 'text' as const,
                                    label: 'Title',
                                },
                            ],
                            sidebar: [],
                        },
                    },
                },
            },
        } as unknown as ResolvedConfig;

        const output = generateSdkTypes(configWithHyphenated);
        expect(output).toContain('"my-plugin": {');
        expect(output).toContain('"some-type": {');
        expect(output).toContain('export interface PluginMyPluginSomeTypeFields {');
    });
});
