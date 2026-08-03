/**
 * Block segmentation for `translate` — the model never sees the structure, so
 * the only thing a reply may change is the text inside a block.
 */

import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import {
    applyRichTextSegments,
    extractRichTextSegments,
} from '@/fields/rich-text/segments.js';
import { checkRichTextDocument } from '@/fields/rich-text/validate.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function article(): JSONContent {
    return {
        type: 'doc',
        content: [
            {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Title' }],
            },
            {
                type: 'paragraph',
                content: [
                    { type: 'text', text: 'Very ' },
                    { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
                    { type: 'text', text: ' text' },
                ],
            },
            { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] },
            {
                type: 'bulletList',
                content: [
                    {
                        type: 'listItem',
                        content: [
                            {
                                type: 'paragraph',
                                content: [{ type: 'text', text: 'One' }],
                            },
                        ],
                    },
                    {
                        type: 'listItem',
                        content: [
                            {
                                type: 'paragraph',
                                content: [{ type: 'text', text: 'Two' }],
                            },
                        ],
                    },
                ],
            },
            {
                type: 'blockquote',
                content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] },
                ],
            },
            { type: 'paragraph' },
        ],
    };
}

/** Node types, order and nesting with the text stripped out. */
function outline(node: JSONContent): unknown {
    return { type: node.type, content: (node.content ?? []).map(outline) };
}

// ---------------------------------------------------------------------------
// extract
// ---------------------------------------------------------------------------

describe('extractRichTextSegments', () => {
    it('returns one segment per text-bearing block, in document order', () => {
        expect(extractRichTextSegments(article())).toEqual([
            { path: [0], text: 'Title' },
            { path: [1], text: 'Very **bold** text' },
            { path: [3, 0, 0], text: 'One' },
            { path: [3, 1, 0], text: 'Two' },
            { path: [4, 0], text: 'Quoted' },
        ]);
    });

    it('does not extract code block content', () => {
        const texts = extractRichTextSegments(article()).map((s) => s.text);
        expect(texts).not.toContain('const x = 1;');
    });

    it('does not send an empty block as a segment', () => {
        const doc = {
            type: 'doc',
            content: [
                { type: 'paragraph' },
                { type: 'paragraph', content: [] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Here' }] },
            ],
        };
        expect(extractRichTextSegments(doc)).toEqual([{ path: [2], text: 'Here' }]);
    });

    it('returns nothing for an absent document', () => {
        expect(extractRichTextSegments(null)).toEqual([]);
        expect(extractRichTextSegments(undefined)).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

describe('applyRichTextSegments', () => {
    it('round trips a document unchanged when the text comes back identical', () => {
        const doc = article();
        const segments = extractRichTextSegments(doc);
        const result = applyRichTextSegments(
            doc,
            segments.map((s) => s.text)
        );
        expect(result).toEqual(article());
    });

    it('changes only the text — node types, order and nesting survive', () => {
        const doc = article();
        const result = applyRichTextSegments(doc, [
            'Titre',
            'Très **gras** texte',
            'Un',
            'Deux',
            'Cité',
        ]);

        expect(outline(result)).toEqual(outline(doc));
        expect(result.content?.[0]?.content?.[0]?.text).toBe('Titre');
        expect(result.content?.[1]?.content?.[1]).toEqual({
            type: 'text',
            text: 'gras',
            marks: [{ type: 'bold' }],
        });
        expect(checkRichTextDocument(result)).toBe(true);
    });

    it('leaves code block content untouched', () => {
        const result = applyRichTextSegments(article(), ['a', 'b', 'c', 'd', 'e']);
        expect(result.content?.[2]).toEqual({
            type: 'codeBlock',
            content: [{ type: 'text', text: 'const x = 1;' }],
        });
    });

    it('throws on too few replacements rather than half-writing', () => {
        expect(() => applyRichTextSegments(article(), ['only one'])).toThrow(
            /needs 5 replacement segment\(s\), got 1/
        );
    });

    it('throws on too many replacements', () => {
        expect(() =>
            applyRichTextSegments(article(), ['a', 'b', 'c', 'd', 'e', 'f'])
        ).toThrow(/needs 5 replacement segment\(s\), got 6/);
    });

    it('does not mutate the input document', () => {
        const doc = article();
        const before = JSON.stringify(doc);
        applyRichTextSegments(doc, ['a', 'b', 'c', 'd', 'e']);
        expect(JSON.stringify(doc)).toBe(before);
    });

    it('empties a block whose replacement is empty without breaking it', () => {
        const doc = {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gone' }] }],
        };
        const result = applyRichTextSegments(doc, ['']);
        expect(result).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
        expect(checkRichTextDocument(result)).toBe(true);
    });

    it('keeps the link attributes Markdown cannot carry', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'See ' },
                        {
                            type: 'text',
                            text: 'the docs',
                            marks: [
                                {
                                    type: 'link',
                                    attrs: {
                                        href: 'https://astromech.dev',
                                        target: '_blank',
                                        rel: 'noopener',
                                        class: null,
                                    },
                                },
                            ],
                        },
                        { type: 'text', text: '.' },
                    ],
                },
            ],
        };

        expect(extractRichTextSegments(doc)).toEqual([
            { path: [0], text: 'See [the docs](https://astromech.dev).' },
        ]);

        const result = applyRichTextSegments(doc, [
            'Voir [la documentation](https://astromech.dev).',
        ]);
        expect(result.content?.[0]?.content?.[1]).toEqual({
            type: 'text',
            text: 'la documentation',
            marks: [
                {
                    type: 'link',
                    attrs: {
                        href: 'https://astromech.dev',
                        target: '_blank',
                        rel: 'noopener',
                        class: null,
                    },
                },
            ],
        });
    });

    it('drops a mark the field forbids from the reply', () => {
        const doc = {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain' }] }],
        };
        const allow = { bold: false };
        const result = applyRichTextSegments(doc, ['**shouty**'], allow);

        expect(result.content?.[0]?.content).toEqual([{ type: 'text', text: 'shouty' }]);
        expect(checkRichTextDocument(result, allow)).toBe(true);
    });

    it('survives a reply that is not the Markdown it was given', () => {
        const doc = article();
        const result = applyRichTextSegments(doc, [
            '# not a heading',
            '**unclosed [link(',
            '`',
            '- item',
            '> quote',
        ]);

        expect(outline(result)).toEqual({
            type: 'doc',
            content: [
                { type: 'heading', content: [{ type: 'text', content: [] }] },
                { type: 'paragraph', content: [{ type: 'text', content: [] }] },
                { type: 'codeBlock', content: [{ type: 'text', content: [] }] },
                {
                    type: 'bulletList',
                    content: [
                        {
                            type: 'listItem',
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [{ type: 'text', content: [] }],
                                },
                            ],
                        },
                        {
                            type: 'listItem',
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [{ type: 'text', content: [] }],
                                },
                            ],
                        },
                    ],
                },
                {
                    type: 'blockquote',
                    content: [
                        { type: 'paragraph', content: [{ type: 'text', content: [] }] },
                    ],
                },
                { type: 'paragraph', content: [] },
            ],
        });
        expect(checkRichTextDocument(result)).toBe(true);
    });
});
