/**
 * Field eligibility — the safety property. Only text-bearing, non-private (and,
 * for translate, translatable) fields reach a model, whatever `paths` names.
 */

import { describe, expect, it } from 'vitest';
import { collectRewriteTargets } from '@/content/internal/eligibility.js';
import type { FieldDefinition } from '@/types/fields.js';

const definitions: FieldDefinition[] = [
    { name: 'summary', type: 'text' },
    { name: 'notes', type: 'textarea' },
    { name: 'body', type: 'richtext' },
    { name: 'sku', type: 'text', translatable: false },
    { name: 'secret', type: 'text', private: true },
    { name: 'rating', type: 'number' },
    { name: 'live', type: 'boolean' },
    { name: 'publishOn', type: 'date' },
    { name: 'tone', type: 'select', options: ['a', 'b'] },
    { name: 'hero', type: 'media' },
    { name: 'related', type: 'relationship', target: 'post' },
    { name: 'slugged', type: 'slug' },
    { name: 'homepage', type: 'url' },
    { name: 'contact', type: 'email' },
    { name: 'blob', type: 'json' },
    { name: 'cta', type: 'link' },
    { name: 'meta', type: 'key-value' },
];

function values(): Record<string, unknown> {
    return {
        summary: 'Summary',
        notes: 'Notes',
        body: { type: 'doc', content: [] },
        sku: 'ABC-123',
        secret: 'hidden',
        rating: 5,
        live: true,
        publishOn: '2026-01-01',
        tone: 'a',
        hero: 'media-1',
        related: 'post-1',
        slugged: 'a-slug',
        homepage: 'https://example.com',
        contact: 'a@example.com',
        blob: { a: 1 },
        cta: { url: 'https://example.com', label: 'Go' },
        meta: { a: 'b' },
    };
}

function paths(
    definitions: FieldDefinition[],
    data: Record<string, unknown>,
    options?: { paths?: string[]; skipNonTranslatable?: boolean }
): string[] {
    return collectRewriteTargets(data, definitions, {
        paths: options?.paths,
        skipNonTranslatable: options?.skipNonTranslatable ?? false,
    }).map((target) => target.path);
}

describe('collectRewriteTargets', () => {
    it('sends only text, textarea and richtext', () => {
        expect(paths(definitions, values())).toEqual(['summary', 'notes', 'body', 'sku']);
    });

    it('never sends a private field, even when `paths` names it', () => {
        expect(paths(definitions, values(), { paths: ['secret'] })).toEqual([]);
    });

    it('never sends a non-text field, even when `paths` names it', () => {
        expect(
            paths(definitions, values(), {
                paths: ['rating', 'hero', 'related', 'cta', 'blob', 'meta', 'homepage'],
            })
        ).toEqual([]);
    });

    it('skips non-translatable fields when asked to', () => {
        expect(paths(definitions, values(), { skipNonTranslatable: true })).toEqual([
            'summary',
            'notes',
            'body',
        ]);
    });

    it('never sends a field type it does not recognise', () => {
        const custom: FieldDefinition[] = [{ name: 'widget', type: 'plugin-widget' }];
        expect(paths(custom, { widget: 'some prose' })).toEqual([]);
    });
});

describe('collectRewriteTargets — containers', () => {
    const nested: FieldDefinition[] = [
        { name: 'summary', type: 'text' },
        {
            name: 'seo',
            type: 'group',
            fields: [
                { name: 'title', type: 'text' },
                { name: 'noindex', type: 'boolean' },
            ],
        },
        {
            name: 'sections',
            type: 'repeater',
            fields: [
                { name: 'heading', type: 'text' },
                { name: 'count', type: 'number' },
            ],
        },
        {
            name: 'nav',
            type: 'tree',
            fields: [{ name: 'label', type: 'text' }],
        },
        {
            name: 'internal',
            type: 'group',
            private: true,
            fields: [{ name: 'memo', type: 'text' }],
        },
        {
            name: 'fixed',
            type: 'repeater',
            translatable: false,
            fields: [{ name: 'label', type: 'text' }],
        },
    ];

    function nestedValues(): Record<string, unknown> {
        return {
            summary: 'Summary',
            seo: { title: 'SEO', noindex: false },
            sections: [
                { _id: 'a1', heading: 'One', count: 1 },
                { _id: 'b2', heading: 'Two', count: 2 },
            ],
            nav: [
                { _id: 'n1', label: 'Root', _children: [{ _id: 'n2', label: 'Leaf' }] },
            ],
            internal: { memo: 'private' },
            fixed: [{ _id: 'f1', label: 'Fixed' }],
        };
    }

    it('addresses nested fields with the `_id` bracket grammar', () => {
        expect(paths(nested, nestedValues())).toEqual([
            'summary',
            'seo.title',
            'sections[a1].heading',
            'sections[b2].heading',
            // `tree` reports a node's scope after its children's.
            'nav[n2].label',
            'nav[n1].label',
            'fixed[f1].label',
        ]);
    });

    it('does not descend into a private or non-translatable container', () => {
        expect(
            paths(nested, nestedValues(), { skipNonTranslatable: true })
        ).not.toContain('fixed[f1].label');
        expect(paths(nested, nestedValues())).not.toContain('internal.memo');
    });

    it('restricts to the paths it is given, subtree included', () => {
        expect(paths(nested, nestedValues(), { paths: ['sections'] })).toEqual([
            'sections[a1].heading',
            'sections[b2].heading',
        ]);
        expect(
            paths(nested, nestedValues(), { paths: ['sections[b2].heading'] })
        ).toEqual(['sections[b2].heading']);
        expect(paths(nested, nestedValues(), { paths: ['seo'] })).toEqual(['seo.title']);
    });

    it('reports the root a nested target belongs to', () => {
        const targets = collectRewriteTargets(nestedValues(), nested, {
            paths: ['sections[a1].heading'],
            skipNonTranslatable: false,
        });
        expect(targets.map((target) => target.root)).toEqual(['sections']);
    });

    it('rejects a malformed path rather than matching nothing', () => {
        expect(() => paths(nested, nestedValues(), { paths: ['sections[a1'] })).toThrow(
            /unterminated item selector/
        );
    });
});
