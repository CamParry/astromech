import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { parseRichText, renderRichText } from '@/fields/rich-text/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A paragraph carrying the attribute defaults the schema fills in. */
function paragraph(...content: JSONContent[]): JSONContent {
    return { type: 'paragraph', attrs: { textAlign: null, balance: false }, content };
}

/** The document parse produces for an empty or content-free input. */
const emptyDoc: JSONContent = {
    type: 'doc',
    content: [{ type: 'paragraph', attrs: { textAlign: null, balance: false } }],
};

/** A document exercising links with attributes, nested lists and every block. */
const richDoc: JSONContent = {
    type: 'doc',
    content: [
        paragraph(
            { type: 'text', text: 'Visit ' },
            {
                type: 'text',
                marks: [
                    {
                        type: 'link',
                        attrs: {
                            href: 'https://example.com',
                            target: '_blank',
                            rel: 'noopener noreferrer',
                            class: 'cta',
                            title: null,
                        },
                    },
                ],
                text: 'the site',
            }
        ),
        {
            type: 'bulletList',
            content: [
                {
                    type: 'listItem',
                    content: [
                        paragraph({ type: 'text', text: 'one' }),
                        {
                            type: 'bulletList',
                            content: [
                                {
                                    type: 'listItem',
                                    content: [
                                        paragraph({ type: 'text', text: 'nested' }),
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        paragraph(
            { type: 'text', marks: [{ type: 'bold' }], text: 'b' },
            { type: 'text', marks: [{ type: 'code' }], text: 'c' }
        ),
        {
            type: 'heading',
            attrs: { textAlign: null, balance: false, level: 2 },
            content: [{ type: 'text', text: 'Head' }],
        },
        {
            type: 'blockquote',
            content: [paragraph({ type: 'text', text: 'quoted' })],
        },
        { type: 'horizontalRule' },
        {
            type: 'orderedList',
            attrs: { start: 1, type: null },
            content: [
                {
                    type: 'listItem',
                    content: [paragraph({ type: 'text', text: 'first' })],
                },
            ],
        },
    ],
};

// ---------------------------------------------------------------------------
// Round trip
// ---------------------------------------------------------------------------

describe('parseRichText round trip', () => {
    it('returns the same document render produced HTML from', () => {
        expect(parseRichText(renderRichText(richDoc))).toEqual(richDoc);
    });

    it('is stable across a second pass', () => {
        const html = renderRichText(richDoc);
        expect(renderRichText(parseRichText(html))).toBe(html);
    });

    it('keeps every heading level', () => {
        const headings: JSONContent = {
            type: 'doc',
            content: [1, 2, 3, 4, 5, 6].map((level) => ({
                type: 'heading',
                attrs: { textAlign: null, balance: false, level },
                content: [{ type: 'text', text: `h${String(level)}` }],
            })),
        };
        expect(parseRichText(renderRichText(headings))).toEqual(headings);
    });
});

// ---------------------------------------------------------------------------
// Marks that exclude one another
// ---------------------------------------------------------------------------

describe('parseRichText with mutually exclusive marks', () => {
    // `code` declares excludes: '_', so the schema keeps it and drops the rest.
    it('keeps code alone when bold wraps it', () => {
        expect(parseRichText('<p><strong><code>x</code></strong></p>')).toEqual({
            type: 'doc',
            content: [paragraph({ type: 'text', marks: [{ type: 'code' }], text: 'x' })],
        });
    });

    it('collapses a document holding both marks on one text node to code', () => {
        const both: JSONContent = {
            type: 'doc',
            content: [
                paragraph({
                    type: 'text',
                    marks: [{ type: 'bold' }, { type: 'code' }],
                    text: 'x',
                }),
            ],
        };
        expect(parseRichText(renderRichText(both))).toEqual({
            type: 'doc',
            content: [paragraph({ type: 'text', marks: [{ type: 'code' }], text: 'x' })],
        });
    });

    it('keeps marks that do not exclude each other', () => {
        expect(parseRichText('<p><em><strong>x</strong></em></p>')).toEqual({
            type: 'doc',
            content: [
                paragraph({
                    type: 'text',
                    marks: [{ type: 'bold' }, { type: 'italic' }],
                    text: 'x',
                }),
            ],
        });
    });
});

// ---------------------------------------------------------------------------
// allow list
// ---------------------------------------------------------------------------

describe('parseRichText with an allow list', () => {
    it('produces no heading when the field forbids headings', () => {
        const result = parseRichText('<h1>x</h1><p>y</p>', { heading: false });
        expect(JSON.stringify(result)).not.toContain('heading');
        expect(result).toEqual({
            type: 'doc',
            content: [
                paragraph({ type: 'text', text: 'x' }),
                paragraph({ type: 'text', text: 'y' }),
            ],
        });
    });

    it('drops the link mark when the field forbids links', () => {
        expect(
            parseRichText('<p><a href="https://ok.test">x</a></p>', { link: false })
        ).toEqual({ type: 'doc', content: [paragraph({ type: 'text', text: 'x' })] });
    });
});

// ---------------------------------------------------------------------------
// Unsafe hrefs
// ---------------------------------------------------------------------------

describe('parseRichText with unsafe hrefs', () => {
    /** The marks on the single text node of a single-paragraph document. */
    function marksOf(html: string): JSONContent[] {
        const text = parseRichText(html).content?.[0]?.content?.[0];
        return text?.marks ?? [];
    }

    it('drops the link mark from a javascript: href but keeps the text', () => {
        expect(parseRichText('<p><a href="javascript:alert(1)">click</a></p>')).toEqual({
            type: 'doc',
            content: [paragraph({ type: 'text', text: 'click' })],
        });
    });

    it('drops the link mark from a data: href but keeps the text', () => {
        expect(
            parseRichText('<p><a href="data:text/html;base64,PHNjcmlwdD4x">click</a></p>')
        ).toEqual({ type: 'doc', content: [paragraph({ type: 'text', text: 'click' })] });
    });

    it('drops a scheme hidden behind whitespace or control characters', () => {
        expect(marksOf('<p><a href="java&#9;script:alert(1)">click</a></p>')).toEqual([]);
        expect(marksOf('<p><a href=" javascript:alert(1)">click</a></p>')).toEqual([]);
        expect(marksOf('<p><a href="javascript&#58;alert(1)">click</a></p>')).toEqual([]);
    });

    it('leaves an absolute https link untouched', () => {
        expect(marksOf('<p><a href="https://example.com">click</a></p>')).toEqual([
            {
                type: 'link',
                attrs: {
                    href: 'https://example.com',
                    target: null,
                    rel: null,
                    class: '',
                    title: null,
                },
            },
        ]);
    });

    it('leaves a relative link untouched', () => {
        expect(marksOf('<p><a href="/about">click</a></p>')).toEqual([
            {
                type: 'link',
                attrs: {
                    href: '/about',
                    target: null,
                    rel: null,
                    class: '',
                    title: null,
                },
            },
        ]);
    });
});

// ---------------------------------------------------------------------------
// Degenerate input
// ---------------------------------------------------------------------------

describe('parseRichText with degenerate input', () => {
    it('returns a document holding one empty paragraph for an empty string', () => {
        expect(parseRichText('')).toEqual(emptyDoc);
    });

    it('returns the same for whitespace only', () => {
        expect(parseRichText('   ')).toEqual(emptyDoc);
    });

    it('wraps bare text in a paragraph', () => {
        expect(parseRichText('Hello world')).toEqual({
            type: 'doc',
            content: [paragraph({ type: 'text', text: 'Hello world' })],
        });
    });

    it('drops a script element entirely', () => {
        expect(parseRichText('<p>safe</p><script>alert(1)</script>')).toEqual({
            type: 'doc',
            content: [paragraph({ type: 'text', text: 'safe' })],
        });
    });
});
