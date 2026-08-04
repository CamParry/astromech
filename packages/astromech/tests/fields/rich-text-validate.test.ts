import { describe, expect, it } from 'vitest';
import type { Field, FieldValidationContext } from '@/types/fields.js';
import {
    checkRichTextDocument,
    coerceRichText,
    validateRichText,
} from '@/fields/rich-text/validate.js';
import { renderRichText } from '@/fields/rich-text/index.js';
import { processFields } from '@/fields/pipeline.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
        stage: 'publish',
        host: { kind: 'entry', record: null },
        user: null,
        reads: { isUnique: async () => true },
    };
}

function fakeCtx() {
    return {
        operation: 'create' as const,
        host: { kind: 'entry' as const, record: null },
        user: null,
        reads: { isUnique: async () => true },
    };
}

// ---------------------------------------------------------------------------
// checkRichTextDocument
// ---------------------------------------------------------------------------

describe('checkRichTextDocument', () => {
    it('accepts a valid document', () => {
        expect(checkRichTextDocument(doc)).toBe(true);
    });

    it('rejects an HTML string by naming what it is', () => {
        expect(checkRichTextDocument('<p>Hello</p>')).toBe(
            'Must be a rich text document, not an HTML string'
        );
    });

    it('rejects a plain string', () => {
        expect(checkRichTextDocument('Hello')).toBe(
            'Must be a rich text document, not an HTML string'
        );
    });

    it('rejects non-object values', () => {
        expect(checkRichTextDocument(42)).toBe('Must be a rich text document');
        expect(checkRichTextDocument(true)).toBe('Must be a rich text document');
        expect(checkRichTextDocument([])).toBe('Must be a rich text document');
    });

    it('rejects an object that is not a document', () => {
        expect(checkRichTextDocument({ foo: 'bar' })).toMatch(/^Invalid rich text:/);
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
        expect(checkRichTextDocument(withMark)).toMatch(/nonsense/);
    });

    // `fromJSON` accepts this — only `check()` catches it, which is why both run.
    it('rejects content the schema forbids in that position', () => {
        const bare = { type: 'doc', content: [{ type: 'text', text: 'bare' }] };
        expect(checkRichTextDocument(bare)).toMatch(/^Invalid rich text:/);
    });
});

// ---------------------------------------------------------------------------
// allow list
// ---------------------------------------------------------------------------

describe('checkRichTextDocument with an allow list', () => {
    it('accepts a heading when headings are allowed', () => {
        expect(checkRichTextDocument(heading)).toBe(true);
    });

    it('rejects a heading when the field forbids headings', () => {
        expect(checkRichTextDocument(heading, { heading: false })).toMatch(/heading/);
    });

    it('still accepts a plain paragraph under a restrictive allow list', () => {
        expect(checkRichTextDocument(doc, { heading: false })).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// validateRichText
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// coerceRichText
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Through the pipeline — the validator has to actually fire on a write
// ---------------------------------------------------------------------------

describe('rich text through processFields', () => {
    const fields: Field[] = [{ name: 'body', type: 'richtext' }];

    it('accepts a valid document', async () => {
        const result = await processFields({ body: doc }, fields, fakeCtx());
        expect(result.errors).toEqual({});
    });

    it('rejects an HTML string', async () => {
        const result = await processFields({ body: '<p>Hello</p>' }, fields, fakeCtx());
        expect(result.errors['body']).toEqual([
            'Must be a rich text document, not an HTML string',
        ]);
    });

    it('normalises an empty rendered document to null instead of storing a string', async () => {
        const result = await processFields({ body: '' }, fields, fakeCtx());
        expect(result.errors).toEqual({});
        expect(result.values['body']).toBe(null);
    });

    it('rejects a node the field forbids', async () => {
        const restricted: Field[] = [
            { name: 'body', type: 'richtext', allow: { heading: false } },
        ];
        const result = await processFields({ body: heading }, restricted, fakeCtx());
        expect(result.errors['body']?.[0]).toMatch(/heading/);
    });
});

// ---------------------------------------------------------------------------
// The regression this exists for: a public-shape read written back
// ---------------------------------------------------------------------------

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
        const result = await processFields(
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
        const result = await processFields(
            overTheWire,
            [{ name: 'body', type: 'richtext' }],
            fakeCtx()
        );
        expect(result.errors).toEqual({});
    });
});
