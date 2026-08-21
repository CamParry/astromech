import type { Field, FieldValidationContext } from '@/types/fields';
import { describe, expect, it } from 'vitest';
import { safeParseFields } from '@/fields/parse-fields';
import { renderRichText } from '@/fields/rich-text/index';
import {
    coerceRichText,
    validateRichText,
    validateRichTextDocument,
} from '@/fields/rich-text/validate';

const doc = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
};

const heading = {
    type: 'doc',
    content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hi' }] },
    ],
};

function ctx(value: unknown, field: Field): FieldValidationContext {
    return {
        value,
        values: {},
        field,
        path: [{ kind: 'field', name: field.name }],
        operation: 'create',
        validation: 'complete',
        resource: { kind: 'entry', record: null },
        user: null,
        lookups: { isUnique: async () => true },
    };
}

function fakeCtx() {
    return {
        operation: 'create' as const,
        resource: { kind: 'entry' as const, record: null },
        user: null,
        lookups: { isUnique: async () => true },
    };
}

describe('validateRichTextDocument', () => {
    it('accepts a valid document', () => {
        expect(validateRichTextDocument(doc)).toBe(true);
    });

    it('rejects an HTML string by naming what it is', () => {
        expect(validateRichTextDocument('<p>Hello</p>')).toBe(
            'Must be a rich text document, not an HTML string'
        );
    });

    it('rejects a plain string', () => {
        expect(validateRichTextDocument('Hello')).toBe(
            'Must be a rich text document, not an HTML string'
        );
    });

    it('rejects non-object values', () => {
        expect(validateRichTextDocument(42)).toBe('Must be a rich text document');
        expect(validateRichTextDocument(true)).toBe('Must be a rich text document');
        expect(validateRichTextDocument([])).toBe('Must be a rich text document');
    });

    it('rejects an object that is not a document', () => {
        expect(validateRichTextDocument({ foo: 'bar' })).toMatch(/^Invalid rich text:/);
    });

    it('rejects an unknown mark type', () => {
        const withMark = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'x', marks: [{ type: 'nonsense' }] }],
                },
            ],
        };
        expect(validateRichTextDocument(withMark)).toMatch(/nonsense/);
    });

    // `fromJSON` accepts this — only `check()` catches it, which is why both run.
    it('rejects content the schema forbids in that position', () => {
        const bare = { type: 'doc', content: [{ type: 'text', text: 'bare' }] };
        expect(validateRichTextDocument(bare)).toMatch(/^Invalid rich text:/);
    });
});

// Executable link schemes — `fromJSON` and `check()` never look at an href

describe('validateRichTextDocument rejects executable link schemes', () => {
    /** A one-paragraph document whose only text carries a link mark. */
    function docWithHref(href: string) {
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

    it('rejects a javascript: href and names it', () => {
        const result = validateRichTextDocument(docWithHref('javascript:alert(1)'));

        expect(result).toMatch(/^Invalid rich text: link href uses an unsafe scheme/);
        expect(result).toContain('javascript:alert(1)');
    });

    it('rejects a data: href and names it', () => {
        const href = 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==';
        const result = validateRichTextDocument(docWithHref(href));

        expect(result).toMatch(/^Invalid rich text: link href uses an unsafe scheme/);
        expect(result).toContain(href);
    });

    it('still accepts an ordinary link', () => {
        expect(validateRichTextDocument(docWithHref('https://example.com'))).toBe(true);
    });

    it('rejects one nested inside a list, not just at the top level', () => {
        const nested = {
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

        expect(validateRichTextDocument(nested)).toMatch(
            /^Invalid rich text: link href uses an unsafe scheme/
        );
    });

    it('truncates a long href so the message stays readable', () => {
        const href = `data:text/html;base64,${'A'.repeat(500)}`;
        const result = validateRichTextDocument(docWithHref(href));

        expect(typeof result).toBe('string');
        expect((result as string).length).toBeLessThan(140);
        expect(result).toContain('A…)');
    });

    // ProseMirror's reason names the offending node, which is the more useful one.
    it('reports the structural reason first when the document is also invalid', () => {
        const invalid = {
            type: 'doc',
            content: [
                {
                    type: 'text',
                    text: 'bare',
                    marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                },
            ],
        };

        const result = validateRichTextDocument(invalid);
        expect(result).toMatch(/^Invalid rich text:/);
        expect(result).not.toContain('unsafe scheme');
    });

    it('rejects through validateRichText too', async () => {
        const result = await validateRichText(
            ctx(docWithHref('javascript:alert(1)'), { name: 'body', type: 'richtext' })
        );

        expect(result).toMatch(/^Invalid rich text: link href uses an unsafe scheme/);
    });
});

describe('validateRichTextDocument with an allow list', () => {
    it('accepts a heading when headings are allowed', () => {
        expect(validateRichTextDocument(heading)).toBe(true);
    });

    it('rejects a heading when the field forbids headings', () => {
        expect(validateRichTextDocument(heading, { heading: false })).toMatch(/heading/);
    });

    it('still accepts a plain paragraph under a restrictive allow list', () => {
        expect(validateRichTextDocument(doc, { heading: false })).toBe(true);
    });
});

describe('validateRichText', () => {
    it('accepts a valid document', async () => {
        expect(await validateRichText(ctx(doc, { name: 'body', type: 'richtext' }))).toBe(
            true
        );
    });

    it('reads the allow list off the field definition', async () => {
        const field: Field = {
            name: 'body',
            type: 'richtext',
            allow: { heading: false },
        };
        expect(await validateRichText(ctx(heading, field))).toMatch(/heading/);
    });
});

describe('coerceRichText', () => {
    it('maps an empty string to null', () => {
        expect(coerceRichText('')).toBe(null);
    });

    it('passes everything else through unchanged', () => {
        expect(coerceRichText(doc)).toBe(doc);
        expect(coerceRichText(null)).toBe(null);
        expect(coerceRichText(undefined)).toBe(undefined);
        expect(coerceRichText('<p>x</p>')).toBe('<p>x</p>');
    });
});

// Through the pipeline — the validator has to actually fire on a write

describe('rich text through safeParseFields', () => {
    const fields: Field[] = [{ name: 'body', type: 'richtext' }];

    it('accepts a valid document', async () => {
        const result = await safeParseFields({ body: doc }, fields, fakeCtx());
        expect(result.errors).toEqual({});
    });

    it('rejects an HTML string', async () => {
        const result = await safeParseFields({ body: '<p>Hello</p>' }, fields, fakeCtx());
        expect(result.errors['body']).toEqual([
            'Must be a rich text document, not an HTML string',
        ]);
    });

    it('normalises an empty rendered document to null instead of storing a string', async () => {
        const result = await safeParseFields({ body: '' }, fields, fakeCtx());
        expect(result.errors).toEqual({});
        expect(result.values['body']).toBe(null);
    });

    it('rejects a node the field forbids', async () => {
        const restricted: Field[] = [
            { name: 'body', type: 'richtext', allow: { heading: false } },
        ];
        const result = await safeParseFields({ body: heading }, restricted, fakeCtx());
        expect(result.errors['body']?.[0]).toMatch(/heading/);
    });
});

describe('public-shape write-back', () => {
    it('rejects the rendered HTML a public read returns, after a JSON round trip', async () => {
        // What a public-shape read hands a caller.
        const rendered = renderRichText(doc);
        expect(rendered).toContain('<p>');

        // Cross the wire, then write it straight back.
        const overTheWire = JSON.parse(JSON.stringify({ body: rendered })) as Record<
            string,
            unknown
        >;
        const result = await safeParseFields(
            overTheWire,
            [{ name: 'body', type: 'richtext' }],
            fakeCtx()
        );

        expect(result.errors['body']).toEqual([
            'Must be a rich text document, not an HTML string',
        ]);
    });

    it('accepts a full-shape read written back unchanged', async () => {
        const overTheWire = JSON.parse(JSON.stringify({ body: doc })) as Record<
            string,
            unknown
        >;
        const result = await safeParseFields(
            overTheWire,
            [{ name: 'body', type: 'richtext' }],
            fakeCtx()
        );
        expect(result.errors).toEqual({});
    });
});
