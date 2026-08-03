/**
 * Markdown converters for rich text. The acceptance criterion is at the bottom:
 * everything the block parser produces has to pass `checkRichTextDocument` for
 * the same allow list, however hostile the input.
 */

import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import type { RichTextAllow } from '@/types/fields.js';
import {
    docToMarkdown,
    inlineToMarkdown,
    markdownToDoc,
    markdownToInline,
} from '@/fields/rich-text/markdown.js';
import { checkRichTextDocument } from '@/fields/rich-text/validate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round trip one block's inline content. */
function inlineRoundTrip(nodes: JSONContent[], allow?: RichTextAllow): JSONContent[] {
    return markdownToInline(inlineToMarkdown(nodes, allow), allow);
}

function text(value: string, marks?: JSONContent['marks']): JSONContent {
    return marks === undefined
        ? { type: 'text', text: value }
        : { type: 'text', text: value, marks };
}

// ---------------------------------------------------------------------------
// Inline marks
// ---------------------------------------------------------------------------

describe('inline marks', () => {
    it('serializes the closed set', () => {
        expect(inlineToMarkdown([text('bold', [{ type: 'bold' }])])).toBe('**bold**');
        expect(inlineToMarkdown([text('italic', [{ type: 'italic' }])])).toBe('_italic_');
        expect(inlineToMarkdown([text('code', [{ type: 'code' }])])).toBe('`code`');
        expect(
            inlineToMarkdown([text('docs', [{ type: 'link', attrs: { href: '/docs' } }])])
        ).toBe('[docs](/docs)');
    });

    it('round trips each mark', () => {
        for (const mark of ['bold', 'italic', 'code']) {
            expect(inlineRoundTrip([text('x', [{ type: mark }])])).toEqual([
                text('x', [{ type: mark }]),
            ]);
        }
    });

    it('round trips a link with its href', () => {
        const nodes = [text('docs', [{ type: 'link', attrs: { href: '/a/b?c=1' } }])];
        expect(inlineRoundTrip(nodes)).toEqual(nodes);
    });

    it('keeps a mixed run split at the same boundaries', () => {
        const nodes = [text('Very '), text('bold', [{ type: 'bold' }]), text(' text')];
        expect(inlineToMarkdown(nodes)).toBe('Very **bold** text');
        expect(inlineRoundTrip(nodes)).toEqual(nodes);
    });

    it('round trips bold inside a link', () => {
        const nodes = [
            text('shout', [{ type: 'link', attrs: { href: '/x' } }, { type: 'bold' }]),
        ];
        expect(inlineToMarkdown(nodes)).toBe('[**shout**](/x)');
        expect(inlineRoundTrip(nodes)).toEqual(nodes);
    });

    it('round trips italic inside bold', () => {
        const nodes = [text('both', [{ type: 'bold' }, { type: 'italic' }])];
        expect(inlineToMarkdown(nodes)).toBe('**_both_**');
        expect(inlineRoundTrip(nodes)).toEqual(nodes);
    });

    it('round trips a hard break', () => {
        const nodes = [text('one'), { type: 'hardBreak' }, text('two')];
        expect(inlineRoundTrip(nodes)).toEqual(nodes);
    });

    it('never combines code with another mark, which the schema forbids', () => {
        const nodes = markdownToInline('[`snippet`](/x)');
        expect(nodes).toEqual([text('snippet', [{ type: 'code' }])]);
        expect(
            checkRichTextDocument({
                type: 'doc',
                content: [{ type: 'paragraph', content: nodes }],
            })
        ).toBe(true);
    });

    it('drops a mark it cannot express rather than inventing syntax', () => {
        expect(inlineToMarkdown([text('under', [{ type: 'underline' }])])).toBe('under');
    });
});

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

describe('inline escaping', () => {
    const samples = [
        '2 * 3 * 4',
        'snake_case_name',
        'a [bracket] here',
        'back`tick`s',
        '# not a heading',
        '- not a list',
        '1. not a list',
        '> not a quote',
        'a \\ backslash',
        '**not bold**',
        'mixed *_`[]',
    ];

    for (const sample of samples) {
        it(`round trips ${sample}`, () => {
            expect(inlineRoundTrip([text(sample)])).toEqual([text(sample)]);
        });
    }

    it('escapes rather than emitting live markup', () => {
        expect(inlineToMarkdown([text('**not bold**')])).toBe('\\*\\*not bold\\*\\*');
        expect(inlineToMarkdown([text('# heading')])).toBe('\\# heading');
    });

    it('keeps escaped text out of the block grammar', () => {
        const doc = markdownToDoc(inlineToMarkdown([text('# not a heading')]));
        expect(doc.content?.[0]?.type).toBe('paragraph');
        expect(doc.content?.[0]?.content).toEqual([text('# not a heading')]);
    });

    it('round trips marked text that also contains delimiters', () => {
        const nodes = [text('2 * 3', [{ type: 'bold' }])];
        expect(inlineToMarkdown(nodes)).toBe('**2 \\* 3**');
        expect(inlineRoundTrip(nodes)).toEqual(nodes);
    });

    it('fences a code span around the backticks it contains', () => {
        const nodes = [text('a ` b', [{ type: 'code' }])];
        expect(inlineToMarkdown(nodes)).toBe('``a ` b``');
        expect(inlineRoundTrip(nodes)).toEqual(nodes);
    });

    it('round trips a href containing parentheses', () => {
        const nodes = [text('wiki', [{ type: 'link', attrs: { href: '/a_(b)' } }])];
        expect(inlineRoundTrip(nodes)).toEqual(nodes);
    });
});

// ---------------------------------------------------------------------------
// Malformed input
// ---------------------------------------------------------------------------

describe('malformed inline Markdown', () => {
    const broken = [
        '**unbalanced',
        'trailing **',
        '[unclosed',
        '[label](no close',
        'stray ` backtick',
        '_lonely',
        '***',
        '[]()',
        'ends with \\',
    ];

    for (const sample of broken) {
        it(`does not throw on ${sample}`, () => {
            expect(() => markdownToInline(sample)).not.toThrow();
            expect(
                checkRichTextDocument({
                    type: 'doc',
                    content: [{ type: 'paragraph', content: markdownToInline(sample) }],
                })
            ).toBe(true);
        });
    }

    it('degrades an unclosed delimiter to literal text', () => {
        expect(markdownToInline('**unbalanced')).toEqual([text('**unbalanced')]);
        expect(markdownToInline('[unclosed')).toEqual([text('[unclosed')]);
        expect(markdownToInline('stray ` backtick')).toEqual([text('stray ` backtick')]);
    });
});

// ---------------------------------------------------------------------------
// Allow list
// ---------------------------------------------------------------------------

describe('allow list', () => {
    const none: RichTextAllow = {
        bold: false,
        italic: false,
        code: false,
        link: false,
    };

    it('parses forbidden marks as plain text', () => {
        expect(markdownToInline('**b** _i_ `c` [l](/x)', none)).toEqual([
            text('b i c l'),
        ]);
    });

    it('never emits a forbidden mark', () => {
        const nodes = [
            text('b', [{ type: 'bold' }]),
            text('l', [{ type: 'link', attrs: { href: '/x' } }]),
        ];
        expect(inlineToMarkdown(nodes, none)).toBe('bl');
    });

    it('turns a heading into a paragraph when headings are forbidden', () => {
        const doc = markdownToDoc('## Section', { heading: false });
        expect(doc.content).toEqual([{ type: 'paragraph', content: [text('Section')] }]);
        expect(checkRichTextDocument(doc, { heading: false })).toBe(true);
    });

    it('flattens a list into paragraphs when lists are forbidden', () => {
        const allow: RichTextAllow = { bulletList: false };
        const doc = markdownToDoc('- one\n- two', allow);
        expect(doc.content).toEqual([
            { type: 'paragraph', content: [text('one')] },
            { type: 'paragraph', content: [text('two')] },
        ]);
        expect(checkRichTextDocument(doc, allow)).toBe(true);
    });

    it('unwraps a blockquote when blockquotes are forbidden', () => {
        const allow: RichTextAllow = { blockquote: false };
        const doc = markdownToDoc('> quoted', allow);
        expect(doc.content).toEqual([{ type: 'paragraph', content: [text('quoted')] }]);
        expect(checkRichTextDocument(doc, allow)).toBe(true);
    });

    it('keeps a forbidden code block as literal text', () => {
        const allow: RichTextAllow = { codeBlock: false };
        const doc = markdownToDoc('```js\nconst x = 1;\n```', allow);
        expect(doc.content).toEqual([
            { type: 'paragraph', content: [text('const x = 1;')] },
        ]);
        expect(checkRichTextDocument(doc, allow)).toBe(true);
    });

    it('drops a forbidden horizontal rule', () => {
        const allow: RichTextAllow = { horizontalRule: false };
        const doc = markdownToDoc('a\n\n---\n\nb', allow);
        expect(doc.content?.map((node) => node.type)).toEqual(['paragraph', 'paragraph']);
        expect(checkRichTextDocument(doc, allow)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Block mapping
// ---------------------------------------------------------------------------

describe('block Markdown', () => {
    const doc: JSONContent = {
        type: 'doc',
        content: [
            { type: 'heading', attrs: { level: 2 }, content: [text('Title')] },
            {
                type: 'paragraph',
                content: [text('Very '), text('bold', [{ type: 'bold' }])],
            },
            {
                type: 'bulletList',
                content: [
                    {
                        type: 'listItem',
                        content: [
                            { type: 'paragraph', content: [text('one')] },
                            {
                                type: 'bulletList',
                                content: [
                                    {
                                        type: 'listItem',
                                        content: [
                                            {
                                                type: 'paragraph',
                                                content: [text('deep')],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        type: 'listItem',
                        content: [{ type: 'paragraph', content: [text('two')] }],
                    },
                ],
            },
            {
                type: 'orderedList',
                content: [
                    {
                        type: 'listItem',
                        content: [{ type: 'paragraph', content: [text('first')] }],
                    },
                ],
            },
            {
                type: 'blockquote',
                content: [{ type: 'paragraph', content: [text('quoted')] }],
            },
            {
                type: 'codeBlock',
                attrs: { language: 'ts' },
                content: [text('const x = 1;\nconst y = 2;')],
            },
            { type: 'horizontalRule' },
        ],
    };

    it('serializes each construct', () => {
        expect(docToMarkdown(doc)).toBe(
            [
                '## Title',
                'Very **bold**',
                '- one\n  - deep\n- two',
                '1. first',
                '> quoted',
                '```ts\nconst x = 1;\nconst y = 2;\n```',
                '---',
            ].join('\n\n')
        );
    });

    it('round trips a whole document', () => {
        expect(markdownToDoc(docToMarkdown(doc))).toEqual(doc);
    });

    it('keeps an ordered list start', () => {
        const parsed = markdownToDoc('3. third\n4. fourth');
        expect(parsed.content?.[0]?.attrs).toEqual({ start: 3 });
        expect(checkRichTextDocument(parsed)).toBe(true);
    });

    it('reads a heading level back', () => {
        expect(markdownToDoc('#### Deep').content?.[0]?.attrs).toEqual({ level: 4 });
    });

    it('folds a soft-wrapped paragraph into one node', () => {
        expect(markdownToDoc('one\ntwo').content).toEqual([
            { type: 'paragraph', content: [text('one two')] },
        ]);
    });

    it('reads a trailing backslash back as a hard break', () => {
        expect(markdownToDoc('one\\\ntwo').content).toEqual([
            {
                type: 'paragraph',
                content: [text('one'), { type: 'hardBreak' }, text('two')],
            },
        ]);
    });

    it('never returns an empty document', () => {
        expect(markdownToDoc('')).toEqual({
            type: 'doc',
            content: [{ type: 'paragraph' }],
        });
        expect(checkRichTextDocument(markdownToDoc(''))).toBe(true);
    });

    it('returns an empty string for an absent document', () => {
        expect(docToMarkdown(null)).toBe('');
        expect(docToMarkdown(undefined)).toBe('');
    });
});

// ---------------------------------------------------------------------------
// Acceptance: the parser cannot produce something validation rejects
// ---------------------------------------------------------------------------

describe('everything the block parser produces validates', () => {
    const hostile = [
        '',
        '   ',
        '\n\n\n',
        '# ',
        '#'.repeat(20) + ' deep',
        '**',
        '***',
        '____',
        '[',
        '[](',
        '[a](b',
        '`',
        '```',
        '```js',
        '- ',
        '- - - -',
        '1. ',
        '>',
        '> > > nested',
        '| a | b |',
        '<script>alert(1)</script>',
        '![img](/x.png)',
        '**bold _mixed** text_',
        '`code **bold**`',
        'a\n\n\n\nb',
        '\\',
        '\\\\\\',
        '      - deeply indented item',
        '- one\n    - two\n        - three\n- four',
        '> quote\n> - list\n> ```\n> code',
        '1. one\n- two\n1) three',
        'text\\\nwith\\\nbreaks',
        'trailing whitespace   \n   leading',
    ];

    const lists: (RichTextAllow | undefined)[] = [
        undefined,
        {},
        { heading: false },
        { bulletList: false, orderedList: false },
        {
            heading: false,
            bold: false,
            italic: false,
            code: false,
            codeBlock: false,
            link: false,
            bulletList: false,
            orderedList: false,
            blockquote: false,
            horizontalRule: false,
        },
    ];

    for (const [index, allow] of lists.entries()) {
        for (const input of hostile) {
            it(`allow list ${String(index)} accepts ${JSON.stringify(input)}`, () => {
                const doc = markdownToDoc(input, allow);
                expect(checkRichTextDocument(doc, allow)).toBe(true);
            });
        }
    }

    it('also validates what it parses from its own output', () => {
        for (const allow of lists) {
            for (const input of hostile) {
                const once = markdownToDoc(input, allow);
                const twice = markdownToDoc(docToMarkdown(once, allow), allow);
                expect(checkRichTextDocument(twice, allow)).toBe(true);
            }
        }
    });
});
