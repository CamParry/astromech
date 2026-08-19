/**
 * These are a second line behind tiptap's own Link validation, which drops
 * these schemes at parse time. They are tested directly because nothing
 * reaching them through `parseRichText` ever exercises them.
 */

import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import {
    findUnsafeLink,
    isUnsafeHref,
    stripUnsafeLinks,
} from '@/fields/rich-text/safe-links';

/** A one-paragraph document whose only text carries a link mark. */
function docWithHref(href: string): JSONContent {
    return {
        type: 'doc',
        content: [
            {
                type: 'paragraph',
                content: [
                    {
                        type: 'text',
                        text: 'click',
                        marks: [{ type: 'link', attrs: { href } }],
                    },
                ],
            },
        ],
    };
}

/** The marks left on the single text node. */
function marksOf(doc: JSONContent): unknown {
    return doc.content?.[0]?.content?.[0]?.marks;
}

describe('stripUnsafeLinks', () => {
    it.each([
        ['javascript:alert(1)'],
        ['JavaScript:alert(1)'],
        ['  javascript:alert(1)'],
        ['java\tscript:alert(1)'],
        ['java\nscript:alert(1)'],
        ['javascript :alert(1)'],
        ['javascript\0:alert(1)'],
        ['data:text/html;base64,PHNjcmlwdD4='],
        ['DATA:text/html,<script>'],
    ])('drops the link mark for %j', (href) => {
        const result = stripUnsafeLinks(docWithHref(href));

        expect(marksOf(result)).toBeUndefined();
        expect(result.content?.[0]?.content?.[0]?.text).toBe('click');
    });

    it.each([
        ['https://example.com'],
        ['http://example.com'],
        ['/about'],
        ['#section'],
        ['mailto:hi@example.com'],
        ['tel:+441234567890'],
    ])('keeps the link mark for %j', (href) => {
        const result = stripUnsafeLinks(docWithHref(href));

        expect(marksOf(result)).toEqual([{ type: 'link', attrs: { href } }]);
    });

    it('keeps other marks on a node whose link was dropped', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: 'click',
                            marks: [
                                { type: 'bold' },
                                { type: 'link', attrs: { href: 'javascript:alert(1)' } },
                            ],
                        },
                    ],
                },
            ],
        };

        expect(marksOf(stripUnsafeLinks(doc))).toEqual([{ type: 'bold' }]);
    });

    it('strips at every depth, not just the top level', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [
                {
                    type: 'bulletList',
                    content: [
                        {
                            type: 'listItem',
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [
                                        {
                                            type: 'text',
                                            text: 'deep',
                                            marks: [
                                                {
                                                    type: 'link',
                                                    attrs: {
                                                        href: 'javascript:alert(1)',
                                                    },
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const nested = stripUnsafeLinks(doc).content?.[0]?.content?.[0]?.content?.[0];
        expect(nested?.content?.[0]?.marks).toBeUndefined();
        expect(nested?.content?.[0]?.text).toBe('deep');
    });

    it('leaves a mark with no href, or a non-string href, alone', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'a', marks: [{ type: 'link' }] },
                        {
                            type: 'text',
                            text: 'b',
                            marks: [{ type: 'link', attrs: { href: 42 } }],
                        },
                    ],
                },
            ],
        };

        const result = stripUnsafeLinks(doc);
        expect(result.content?.[0]?.content?.[0]?.marks).toEqual([{ type: 'link' }]);
        expect(result.content?.[0]?.content?.[1]?.marks).toEqual([
            { type: 'link', attrs: { href: 42 } },
        ]);
    });

    it('does not mutate the document it is given', () => {
        const doc = docWithHref('javascript:alert(1)');

        stripUnsafeLinks(doc);

        expect(marksOf(doc)).toEqual([
            { type: 'link', attrs: { href: 'javascript:alert(1)' } },
        ]);
    });
});

describe('isUnsafeHref', () => {
    it.each([
        ['javascript:alert(1)'],
        ['JavaScript:alert(1)'],
        ['  javascript:alert(1)'],
        ['java\tscript:alert(1)'],
        ['java\nscript:alert(1)'],
        ['javascript :alert(1)'],
        ['javascript\0:alert(1)'],
        ['data:text/html;base64,PHNjcmlwdD4='],
        ['DATA:text/html,<script>'],
    ])('is true for %j', (href) => {
        expect(isUnsafeHref(href)).toBe(true);
    });

    it.each([
        ['https://example.com'],
        ['http://example.com'],
        ['/about'],
        ['#section'],
        ['mailto:hi@example.com'],
        ['tel:+441234567890'],
    ])('is false for %j', (href) => {
        expect(isUnsafeHref(href)).toBe(false);
    });

    it('is false for anything that is not a string', () => {
        expect(isUnsafeHref(undefined)).toBe(false);
        expect(isUnsafeHref(42)).toBe(false);
        expect(isUnsafeHref(null)).toBe(false);
    });
});

describe('findUnsafeLink', () => {
    it('returns the offending href', () => {
        expect(findUnsafeLink(docWithHref('javascript:alert(1)'))).toBe(
            'javascript:alert(1)'
        );
    });

    it('returns null when every link is safe', () => {
        expect(findUnsafeLink(docWithHref('https://example.com'))).toBe(null);
    });

    it('finds one nested below the top level', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [
                {
                    type: 'bulletList',
                    content: [
                        {
                            type: 'listItem',
                            content: [
                                {
                                    type: 'paragraph',
                                    content: [
                                        {
                                            type: 'text',
                                            text: 'deep',
                                            marks: [
                                                {
                                                    type: 'link',
                                                    attrs: {
                                                        href: 'javascript:alert(1)',
                                                    },
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        expect(findUnsafeLink(doc)).toBe('javascript:alert(1)');
    });

    it('returns the first of several, depth-first', () => {
        const doc: JSONContent = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'text',
                            text: 'one',
                            marks: [
                                { type: 'link', attrs: { href: 'javascript:alert(1)' } },
                            ],
                        },
                        {
                            type: 'text',
                            text: 'two',
                            marks: [
                                { type: 'link', attrs: { href: 'data:text/html,<x>' } },
                            ],
                        },
                    ],
                },
            ],
        };

        expect(findUnsafeLink(doc)).toBe('javascript:alert(1)');
    });

    it('does not mutate the document it is given', () => {
        const doc = docWithHref('javascript:alert(1)');

        findUnsafeLink(doc);

        expect(doc).toEqual(docWithHref('javascript:alert(1)'));
    });
});
