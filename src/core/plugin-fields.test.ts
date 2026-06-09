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
                fieldGroups: [
                    {
                        name: 'seo',
                        label: 'SEO',
                        placement: 'tab',
                        fields: [{ name: 'seo', type: 'seo-meta' }],
                    },
                ],
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
});
