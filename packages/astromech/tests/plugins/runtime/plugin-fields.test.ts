import type { EntryType, PluginDefinition, ResolvedConfig } from '@/types/index';
import { resolveTestConfig } from '@tests/harness';
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
    let config: ResolvedConfig;

    beforeEach(() => {
        config = resolveTestConfig({
            entries: {
                posts: {
                    single: 'Post',
                    plural: 'Posts',
                    fields: [{ name: 'seo', type: 'seo-meta' }],
                },
            },
            plugins: [
                def({
                    package: '@a/seo',
                    fields: [{ type: 'seo-meta', component: '@a/seo/field' }],
                }),
            ],
        });
        // Resolving registers the plugin's field type; each test sets its own.
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
    const posts: EntryType = { single: 'Post', plural: 'Posts', fields: [] };

    const formEntryType: EntryType = {
        type: 'form',
        single: 'Form',
        plural: 'Forms',
        fields: [
            { name: 'from', type: 'text', label: 'From', required: true },
            { name: 'to', type: 'text', label: 'To', required: true },
            { name: 'status', type: 'select', label: 'Type', options: ['301', '302'] },
            { name: 'enabled', type: 'boolean', label: 'Enabled' },
        ],
    };

    /** The forms plugin, contributing the `forms/form` entry type. */
    const formsPlugin = def({ package: '@astromech/forms', entries: [formEntryType] });

    const configWithPluginEntries = resolveTestConfig({
        entries: { posts },
        plugins: [formsPlugin],
    });

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
        const configWithRelation = resolveTestConfig({
            entries: {
                posts: {
                    ...posts,
                    fields: [
                        {
                            name: 'related_form',
                            type: 'relationship',
                            target: 'forms/form',
                            label: 'Related Form',
                        },
                    ],
                },
            },
            plugins: [formsPlugin],
        });

        const output = generateClientTypes(configWithRelation);
        expect(output).toContain("import('astromech').TypedEntry<FormsFormFields>");
    });

    it('PascalCases hyphenated plugin/type names into the Fields type name', () => {
        const configWithHyphenated = resolveTestConfig({
            entries: { posts },
            plugins: [
                def({
                    package: 'my-plugin',
                    entries: [
                        {
                            type: 'some-type',
                            single: 'Some Type',
                            plural: 'Some Types',
                            fields: [{ name: 'title', type: 'text', label: 'Title' }],
                        },
                    ],
                }),
            ],
        });

        const output = generateClientTypes(configWithHyphenated);
        expect(output).toContain('export type MyPluginSomeTypeFields = {');
    });

    it('throws when two ids generate the same type name', () => {
        const colliding = resolveTestConfig({
            entries: { forms_form: { single: 'Form', plural: 'Forms', fields: [] } },
            plugins: [formsPlugin],
        });

        expect(() => generateClientTypes(colliding)).toThrow(
            /"forms_form" and "forms\/form" both generate/
        );
    });
});
