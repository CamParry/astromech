import type { PluginDefinition, ResolvedConfig } from '@/types/index';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { generateClientTypes } from '@/codegen/type-generator';
import { setPluginFieldTypes } from '@/fields/field-type-registry';
import {
    assertNoFieldTypeCollisions,
    pluginFieldTypes,
} from '@/plugins/runtime/plugin-fields';

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

describe('pluginFieldTypes', () => {
    it('lists each plugin field type without its admin component', () => {
        const types = pluginFieldTypes([
            def({
                package: '@a/seo',
                fields: [
                    { type: 'seo-meta', component: '@a/seo/field', defaultValue: {} },
                ],
            }),
        ]);
        expect(types).toEqual([{ type: 'seo-meta', defaultValue: {} }]);
    });
});

describe('generateClientTypes with plugin field types', () => {
    const config = {
        basePath: '/cms',
        globals: {},
        entryTypes: {
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

    beforeEach(() => {
        setPluginFieldTypes([]);
    });

    it('uses the plugin type’s tsType when provided', () => {
        setPluginFieldTypes([
            { type: 'seo-meta', tsType: () => '{ title: string; description: string }' },
        ]);
        const output = generateClientTypes(config);
        expect(output).toContain('seo?: { title: string; description: string };');
    });

    it('falls back to JsonValue without a tsType', () => {
        setPluginFieldTypes([{ type: 'seo-meta' }]);
        const output = generateClientTypes(config);
        expect(output).toContain("seo?: import('astromech').JsonValue;");
    });

    it('omits a plugin field that affects no data', () => {
        setPluginFieldTypes([{ type: 'seo-meta', affectsData: false }]);
        expect(generateClientTypes(config)).not.toContain('seo?:');
    });

    it('skips unknown field types entirely without a registration', () => {
        const output = generateClientTypes(config);
        expect(output).not.toContain('seo?:');
    });

    it('emits hook-event augmentations (service lines no longer generated)', () => {
        const output = generateClientTypes(config, [
            def({
                package: '@astromech/redirects',
                service: {
                    lookup: {
                        access: 'public',
                        input: z.object({ path: z.string() }),
                        mutates: false,
                        handler: async () => null,
                    },
                },
                hookEvents: ['redirects:resolved'],
            }),
        ]);
        expect(output).toContain("'redirects:resolved': unknown;");
        expect(output).not.toContain('lookup(');
    });

    it('omits the plugin augmentation block when no plugin contributes', () => {
        const output = generateClientTypes(config, [def({ package: '@a/b' })]);
        expect(output).not.toContain('AstromechPluginServices');
    });
});

describe('generateClientTypes — plugin entry types', () => {
    const baseConfig = {
        basePath: '/cms',
        globals: {},
        entryTypes: {
            posts: {
                single: 'Post',
                plural: 'Posts',
                fields: { main: [], sidebar: [] },
            },
        },
        trash: { enabled: true, retentionDays: 30 },
    } as unknown as ResolvedConfig;

    const formFields = {
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
        entryTypes: {
            ...baseConfig.entryTypes,
            'forms/form': {
                single: 'Form',
                plural: 'Forms',
                fields: formFields,
            },
        },
    } as unknown as ResolvedConfig;

    it('generates the FormsFormFields type from the qualified id', () => {
        const output = generateClientTypes(configWithPluginEntries);
        expect(output).toContain('export type FormsFormFields = {');
        expect(output).toContain('from: string;');
        expect(output).toContain('to: string;');
        expect(output).toContain('status?: string;');
        expect(output).toContain('enabled?: boolean;');
    });

    it('generates FormsFormRelations type', () => {
        const output = generateClientTypes(configWithPluginEntries);
        expect(output).toContain('export type FormsFormRelations =');
    });

    it('augments AstromechEntryTypes under the qualified id, as a site type is', () => {
        const output = generateClientTypes(configWithPluginEntries);
        expect(output).toContain(
            '    "forms/form": { fields: FormsFormFields; fieldsPublic: FormsFormFieldsPublic; relations: FormsFormRelations };'
        );
        expect(output).toContain('// --- Entry type: forms/form (FormsForm) ---');
    });

    it('resolves a qualified relation target to the plugin Fields type, public shape included', () => {
        const configWithRelation = {
            ...configWithPluginEntries,
            entryTypes: {
                ...configWithPluginEntries.entryTypes,
                posts: {
                    single: 'Post',
                    plural: 'Posts',
                    fields: {
                        main: [
                            {
                                name: 'related_form',
                                type: 'relationship',
                                target: 'forms/form',
                                label: 'Related Form',
                            },
                        ],
                        sidebar: [],
                    },
                },
            },
        } as unknown as ResolvedConfig;

        const output = generateClientTypes(configWithRelation);
        expect(output).toContain("import('astromech').TypedEntry<FormsFormFields>");
    });

    it('PascalCases hyphenated plugin/type names into the Fields type name', () => {
        const configWithHyphenated = {
            ...baseConfig,
            entryTypes: {
                'my-plugin/some-type': {
                    single: 'Some Type',
                    plural: 'Some Types',
                    fields: {
                        main: [{ name: 'title', type: 'text' as const, label: 'Title' }],
                        sidebar: [],
                    },
                },
            },
        } as unknown as ResolvedConfig;

        const output = generateClientTypes(configWithHyphenated);
        expect(output).toContain('export type MyPluginSomeTypeFields = {');
    });

    it('throws when two ids generate the same type name', () => {
        const colliding = {
            ...baseConfig,
            entryTypes: {
                forms_form: { fields: { main: [], sidebar: [] } },
                'forms/form': { fields: { main: [], sidebar: [] } },
            },
        } as unknown as ResolvedConfig;

        expect(() => generateClientTypes(colliding)).toThrow(
            /"forms_form" and "forms\/form" both generate/
        );
    });
});
