import type { ResourceType } from '@/types/domain';
import type { Field, FieldValidationContext, ValidationMode } from '@/types/fields';
import { describe, expect, it, vi } from 'vitest';
import { registerFieldType } from '@/fields/field-type-registry';
import { parseFields } from '@/fields/pipeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CtxOverrides = Partial<{
    operation: 'create' | 'update';
    validation: ValidationMode;
    resource: { kind: ResourceType; record: unknown };
    user: null;
    lookups: { isUnique: (field: Field, value: unknown) => Promise<boolean> };
}>;

function fakeCtx(overrides: CtxOverrides = {}) {
    return {
        operation: 'create' as const,
        resource: { kind: 'entry' as const, record: {} },
        user: null,
        lookups: { isUnique: async () => true },
        ...overrides,
    };
}

function field(def: Partial<Field> & { name: string; type: string }): Field {
    return def as Field;
}

// ---------------------------------------------------------------------------
// required
// ---------------------------------------------------------------------------

describe('required', () => {
    it('empty + required → error keyed by field name', async () => {
        const { errors } = await parseFields(
            { title: '' },
            [field({ name: 'title', type: 'text', required: true })],
            fakeCtx()
        );
        expect(errors.title).toEqual(['This field is required']);
    });

    it('null + required → error', async () => {
        const { errors } = await parseFields(
            { title: null },
            [field({ name: 'title', type: 'text', required: true })],
            fakeCtx()
        );
        expect(errors.title).toEqual(['This field is required']);
    });

    it('undefined + required → error', async () => {
        const { errors } = await parseFields(
            {},
            [field({ name: 'title', type: 'text', required: true })],
            fakeCtx()
        );
        expect(errors.title).toEqual(['This field is required']);
    });

    it('empty array + required → error', async () => {
        const { errors } = await parseFields(
            { tags: [] },
            [field({ name: 'tags', type: 'multiselect', required: true })],
            fakeCtx()
        );
        expect(errors.tags).toEqual(['This field is required']);
    });

    it('empty + optional → no error', async () => {
        const { errors } = await parseFields(
            { title: '' },
            [field({ name: 'title', type: 'text' })],
            fakeCtx()
        );
        expect(errors.title).toBeUndefined();
    });

    it('create + absent value with field.defaultValue → default applied, required passes', async () => {
        const { values, errors } = await parseFields(
            {},
            [
                field({
                    name: 'status',
                    type: 'text',
                    required: true,
                    defaultValue: 'draft',
                }),
            ],
            fakeCtx({ operation: 'create' })
        );
        expect(values.status).toBe('draft');
        expect(errors.status).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// stage: completeness vs correctness
//
// `required` and a container's `min` are COMPLETENESS — "is this finished?" —
// and run only at `'publish'`. Everything else, `max` included, is CORRECTNESS
// and runs on every write.
// ---------------------------------------------------------------------------

describe('stage', () => {
    const bounded = field({
        name: 'sections',
        type: 'repeater',
        min: 2,
        max: 3,
        fields: [field({ name: 'title', type: 'text' })],
    });

    describe("'save' skips completeness", () => {
        it('required + empty → no error', async () => {
            const { errors } = await parseFields(
                { title: '' },
                [field({ name: 'title', type: 'text', required: true })],
                fakeCtx({ validation: 'partial' })
            );
            expect(errors).toEqual({});
        });

        it('container below min → no error', async () => {
            const { errors } = await parseFields(
                { sections: [{ _id: 'a1', title: 'a' }] },
                [bounded],
                fakeCtx({ validation: 'partial' })
            );
            expect(errors).toEqual({});
        });
    });

    describe("'save' still runs correctness", () => {
        it('container above max → error', async () => {
            const { errors } = await parseFields(
                {
                    sections: [
                        { _id: 'a1' },
                        { _id: 'a2' },
                        { _id: 'a3' },
                        { _id: 'a4' },
                    ],
                },
                [bounded],
                fakeCtx({ validation: 'partial' })
            );
            expect(errors.sections).toEqual(['Must have at most 3 items']);
        });

        it('malformed url → error', async () => {
            const { errors } = await parseFields(
                { website: 'not-a-url' },
                [field({ name: 'website', type: 'url' })],
                fakeCtx({ validation: 'partial' })
            );
            expect(errors.website).toEqual(['Must be a valid URL']);
        });

        it('malformed email → error', async () => {
            const { errors } = await parseFields(
                { email: 'not-an-email' },
                [field({ name: 'email', type: 'text', validation: [{ email: true }] })],
                fakeCtx({ validation: 'partial' })
            );
            expect(errors.email).toEqual(['Must be a valid email address']);
        });

        it('pattern mismatch → error', async () => {
            const { errors } = await parseFields(
                { code: 'abc123' },
                [
                    field({
                        name: 'code',
                        type: 'text',
                        validation: [{ pattern: '^[A-Z]+\\d+$' }],
                    }),
                ],
                fakeCtx({ validation: 'partial' })
            );
            expect(errors.code).toEqual(['Invalid format']);
        });

        it('maxLength exceeded → error', async () => {
            const { errors } = await parseFields(
                { slug: 'toolongslug' },
                [field({ name: 'slug', type: 'text', validation: [{ maxLength: 5 }] })],
                fakeCtx({ validation: 'partial' })
            );
            expect(errors.slug).toEqual(['Must be at most 5 characters']);
        });
    });

    describe("'publish' enforces completeness", () => {
        it('required + empty → error', async () => {
            const { errors } = await parseFields(
                { title: '' },
                [field({ name: 'title', type: 'text', required: true })],
                fakeCtx({ validation: 'complete' })
            );
            expect(errors.title).toEqual(['This field is required']);
        });

        it('container below min → error', async () => {
            const { errors } = await parseFields(
                { sections: [{ _id: 'a1', title: 'a' }] },
                [bounded],
                fakeCtx({ validation: 'complete' })
            );
            expect(errors.sections).toEqual(['Must have at least 2 items']);
        });
    });

    // Media, users and settings never pass a stage; they must keep behaving
    // exactly as they did before the split existed.
    describe('an omitted stage behaves as publish', () => {
        it('required + empty → error', async () => {
            const { errors } = await parseFields(
                { title: '' },
                [field({ name: 'title', type: 'text', required: true })],
                fakeCtx()
            );
            expect(errors.title).toEqual(['This field is required']);
        });

        it('container below min → error', async () => {
            const { errors } = await parseFields(
                { sections: [{ _id: 'a1', title: 'a' }] },
                [bounded],
                fakeCtx()
            );
            expect(errors.sections).toEqual(['Must have at least 2 items']);
        });
    });

    it('a custom validator sees a concrete mode', async () => {
        const seen: unknown[] = [];
        await parseFields(
            { title: 'x' },
            [
                field({
                    name: 'title',
                    type: 'text',
                    validation: [
                        {
                            custom: async (ctx: FieldValidationContext) => {
                                seen.push(ctx.validation);
                                return true;
                            },
                        },
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(seen).toEqual(['complete']);
    });
});

// ---------------------------------------------------------------------------
// default
// ---------------------------------------------------------------------------

describe('default', () => {
    it('create + absent → field.defaultValue applied', async () => {
        const { values } = await parseFields(
            {},
            [field({ name: 'status', type: 'text', defaultValue: 'draft' })],
            fakeCtx({ operation: 'create' })
        );
        expect(values.status).toBe('draft');
    });

    it('type-level fallback: boolean field without field.defaultValue → false', async () => {
        const { values } = await parseFields(
            {},
            [field({ name: 'active', type: 'boolean' })],
            fakeCtx({ operation: 'create' })
        );
        expect(values.active).toBe(false);
    });

    it('field.defaultValue wins over the field type defaultValue', async () => {
        // the boolean field type's defaultValue is false; override with true
        const { values } = await parseFields(
            {},
            [field({ name: 'active', type: 'boolean', defaultValue: true })],
            fakeCtx({ operation: 'create' })
        );
        expect(values.active).toBe(true);
    });

    it('update + absent → NO default applied', async () => {
        const { values } = await parseFields(
            {},
            [field({ name: 'status', type: 'text', defaultValue: 'draft' })],
            fakeCtx({ operation: 'update' })
        );
        expect(values.status).toBeUndefined();
    });

    it('null + create → treated as absent, default applied', async () => {
        const { values } = await parseFields(
            { status: null },
            [field({ name: 'status', type: 'text', defaultValue: 'draft' })],
            fakeCtx({ operation: 'create' })
        );
        expect(values.status).toBe('draft');
    });
});

// ---------------------------------------------------------------------------
// coerce
// ---------------------------------------------------------------------------

describe('coerce', () => {
    // Register a throwaway field type with a trim coerce fn.
    registerFieldType({
        type: 't-coerce',
        build: (() => ({})) as never,
        component: '',
        tsType: () => 'string',
        coerce: (x) => String(x).trim(),
        validate: async () => true,
    });

    it('trims value via the field type coerce', async () => {
        const { values } = await parseFields(
            { name: '  hello  ' },
            [field({ name: 'name', type: 't-coerce' })],
            fakeCtx()
        );
        expect(values.name).toBe('hello');
    });

    it('coercion happens before validation', async () => {
        const { errors } = await parseFields(
            { name: '  ' },
            [field({ name: 'name', type: 't-coerce', required: true })],
            fakeCtx()
        );
        // After coerce, '  ' → '' → empty → required error
        expect(errors.name).toEqual(['This field is required']);
    });
});

// ---------------------------------------------------------------------------
// Rule: minLength
// ---------------------------------------------------------------------------

describe('rule: minLength', () => {
    it('pass: string meets min length', async () => {
        const { errors } = await parseFields(
            { bio: 'hello' },
            [field({ name: 'bio', type: 'text', validation: [{ minLength: 3 }] })],
            fakeCtx()
        );
        expect(errors.bio).toBeUndefined();
    });

    it('fail: string below min length', async () => {
        const { errors } = await parseFields(
            { bio: 'hi' },
            [field({ name: 'bio', type: 'text', validation: [{ minLength: 3 }] })],
            fakeCtx()
        );
        expect(errors.bio).toEqual(['Must be at least 3 characters']);
    });

    it('pass: array meets min length', async () => {
        const { errors } = await parseFields(
            { tags: ['a', 'b', 'c'] },
            [
                field({
                    name: 'tags',
                    type: 'multiselect',
                    validation: [{ minLength: 2 }],
                }),
            ],
            fakeCtx()
        );
        expect(errors.tags).toBeUndefined();
    });

    it('fail: array below min length', async () => {
        const { errors } = await parseFields(
            { tags: ['a'] },
            [
                field({
                    name: 'tags',
                    type: 'multiselect',
                    validation: [{ minLength: 2 }],
                }),
            ],
            fakeCtx()
        );
        expect(errors.tags).toEqual(['Must be at least 2 characters']);
    });

    // A rule that cannot measure the value reports the mismatch. Here the number
    // type's own validator accepts 1 first, so the rule is what reports.
    it('reports a mismatch rather than passing a value it cannot measure', async () => {
        const { errors } = await parseFields(
            { count: 1 },
            [field({ name: 'count', type: 'number', validation: [{ minLength: 5 }] })],
            fakeCtx()
        );
        expect(errors.count).toEqual(['Must be text or a list']);
    });
});

// ---------------------------------------------------------------------------
// Rule: maxLength
// ---------------------------------------------------------------------------

describe('rule: maxLength', () => {
    it('pass: string at max length', async () => {
        const { errors } = await parseFields(
            { slug: 'hello' },
            [field({ name: 'slug', type: 'text', validation: [{ maxLength: 5 }] })],
            fakeCtx()
        );
        expect(errors.slug).toBeUndefined();
    });

    it('fail: string exceeds max length', async () => {
        const { errors } = await parseFields(
            { slug: 'toolongslug' },
            [field({ name: 'slug', type: 'text', validation: [{ maxLength: 5 }] })],
            fakeCtx()
        );
        expect(errors.slug).toEqual(['Must be at most 5 characters']);
    });
});

// ---------------------------------------------------------------------------
// Rule: min
// ---------------------------------------------------------------------------

describe('rule: min', () => {
    it('pass: number meets minimum', async () => {
        const { errors } = await parseFields(
            { age: 18 },
            [field({ name: 'age', type: 'number', validation: [{ min: 18 }] })],
            fakeCtx()
        );
        expect(errors.age).toBeUndefined();
    });

    it('fail: number below minimum', async () => {
        const { errors } = await parseFields(
            { age: 16 },
            [field({ name: 'age', type: 'number', validation: [{ min: 18 }] })],
            fakeCtx()
        );
        expect(errors.age).toEqual(['Must be at least 18']);
    });

    it('reports a mismatch rather than passing a value it cannot compare', async () => {
        const { errors } = await parseFields(
            { age: 'old' },
            [field({ name: 'age', type: 'text', validation: [{ min: 18 }] })],
            fakeCtx()
        );
        expect(errors.age).toEqual(['Must be a number']);
    });
});

// ---------------------------------------------------------------------------
// Rule: max
// ---------------------------------------------------------------------------

describe('rule: max', () => {
    it('pass: number at maximum', async () => {
        const { errors } = await parseFields(
            { score: 100 },
            [field({ name: 'score', type: 'number', validation: [{ max: 100 }] })],
            fakeCtx()
        );
        expect(errors.score).toBeUndefined();
    });

    it('fail: number exceeds maximum', async () => {
        const { errors } = await parseFields(
            { score: 101 },
            [field({ name: 'score', type: 'number', validation: [{ max: 100 }] })],
            fakeCtx()
        );
        expect(errors.score).toEqual(['Must be at most 100']);
    });
});

// ---------------------------------------------------------------------------
// Rule: pattern
// ---------------------------------------------------------------------------

describe('rule: pattern', () => {
    it('pass: string matches pattern', async () => {
        const { errors } = await parseFields(
            { code: 'ABC123' },
            [
                field({
                    name: 'code',
                    type: 'text',
                    validation: [{ pattern: '^[A-Z]+\\d+$' }],
                }),
            ],
            fakeCtx()
        );
        expect(errors.code).toBeUndefined();
    });

    it('fail: string does not match pattern → default message', async () => {
        const { errors } = await parseFields(
            { code: 'abc123' },
            [
                field({
                    name: 'code',
                    type: 'text',
                    validation: [{ pattern: '^[A-Z]+\\d+$' }],
                }),
            ],
            fakeCtx()
        );
        expect(errors.code).toEqual(['Invalid format']);
    });

    it('fail: string does not match pattern → custom message', async () => {
        const { errors } = await parseFields(
            { code: 'abc123' },
            [
                field({
                    name: 'code',
                    type: 'text',
                    validation: [
                        {
                            pattern: '^[A-Z]+\\d+$',
                            message: 'Use uppercase letters then digits',
                        },
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors.code).toEqual(['Use uppercase letters then digits']);
    });
});

// ---------------------------------------------------------------------------
// Rule: email
// ---------------------------------------------------------------------------

describe('rule: email', () => {
    it('pass: valid email', async () => {
        const { errors } = await parseFields(
            { email: 'user@example.com' },
            [field({ name: 'email', type: 'text', validation: [{ email: true }] })],
            fakeCtx()
        );
        expect(errors.email).toBeUndefined();
    });

    it('fail: invalid email', async () => {
        const { errors } = await parseFields(
            { email: 'not-an-email' },
            [field({ name: 'email', type: 'text', validation: [{ email: true }] })],
            fakeCtx()
        );
        expect(errors.email).toEqual(['Must be a valid email address']);
    });
});

// ---------------------------------------------------------------------------
// Rule: url
// ---------------------------------------------------------------------------

describe('rule: url', () => {
    it('pass: valid URL', async () => {
        const { errors } = await parseFields(
            { website: 'https://example.com' },
            [field({ name: 'website', type: 'text', validation: [{ url: true }] })],
            fakeCtx()
        );
        expect(errors.website).toBeUndefined();
    });

    it('fail: invalid URL', async () => {
        const { errors } = await parseFields(
            { website: 'not-a-url' },
            [field({ name: 'website', type: 'text', validation: [{ url: true }] })],
            fakeCtx()
        );
        expect(errors.website).toEqual(['Must be a valid URL']);
    });
});

// ---------------------------------------------------------------------------
// Rule: enum
// ---------------------------------------------------------------------------

describe('rule: enum', () => {
    it('pass: value in enum', async () => {
        const { errors } = await parseFields(
            { status: 'draft' },
            [
                field({
                    name: 'status',
                    type: 'text',
                    validation: [{ enum: ['draft', 'published'] }],
                }),
            ],
            fakeCtx()
        );
        expect(errors.status).toBeUndefined();
    });

    it('fail: value not in enum', async () => {
        const { errors } = await parseFields(
            { status: 'archived' },
            [
                field({
                    name: 'status',
                    type: 'text',
                    validation: [{ enum: ['draft', 'published'] }],
                }),
            ],
            fakeCtx()
        );
        expect(errors.status).toEqual(['Must be one of: draft, published']);
    });

    // A multiselect / checkbox group holds an array. The rule has to mean
    // "every selected value is permitted" — testing the array itself for
    // membership rejects every non-empty selection.
    it('pass: every value of a multi-value field is in enum', async () => {
        const { errors } = await parseFields(
            { tags: ['draft', 'published'] },
            [
                field({
                    name: 'tags',
                    type: 'multiselect',
                    validation: [{ enum: ['draft', 'published'] }],
                }),
            ],
            fakeCtx()
        );
        expect(errors.tags).toBeUndefined();
    });

    it('fail: one value of a multi-value field is not in enum', async () => {
        const { errors } = await parseFields(
            { tags: ['draft', 'archived'] },
            [
                field({
                    name: 'tags',
                    type: 'multiselect',
                    validation: [{ enum: ['draft', 'published'] }],
                }),
            ],
            fakeCtx()
        );
        expect(errors.tags).toEqual(['Must be one of: draft, published']);
    });
});

// ---------------------------------------------------------------------------
// One message per field, in a fixed order
//
// A field reports its FIRST failure only: required → container counts → the
// type's own validator → the author's declarative rules in declaration order.
// ---------------------------------------------------------------------------

describe('one message per field', () => {
    it('two failing rules → only the first-declared one is reported', async () => {
        const { errors } = await parseFields(
            { code: 'ab' },
            [
                field({
                    name: 'code',
                    type: 'text',
                    validation: [
                        { minLength: 5 },
                        { pattern: '^[A-Z]+$', message: 'Must be uppercase' },
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors.code).toEqual(['Must be at least 5 characters']);
    });

    it('declaration order decides which of two failures is reported', async () => {
        const { errors } = await parseFields(
            { code: 'ab' },
            [
                field({
                    name: 'code',
                    type: 'text',
                    validation: [
                        { pattern: '^[A-Z]+$', message: 'Must be uppercase' },
                        { minLength: 5 },
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors.code).toEqual(['Must be uppercase']);
    });

    // The case that motivated the reorder: an author rule cannot be judged
    // against a value that is not even a URL, so the type's own validator wins.
    it("the type's validator beats an author rule on the same field", async () => {
        const { errors } = await parseFields(
            { website: 'not-a-url' },
            [
                field({
                    name: 'website',
                    type: 'url',
                    validation: [
                        {
                            pattern: '^https://example\\.com',
                            message: 'Must be on example.com',
                        },
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors.website).toEqual(['Must be a valid URL']);
    });

    it('a well-formed value then falls through to the author rule', async () => {
        const { errors } = await parseFields(
            { website: 'https://other.com' },
            [
                field({
                    name: 'website',
                    type: 'url',
                    validation: [
                        {
                            pattern: '^https://example\\.com',
                            message: 'Must be on example.com',
                        },
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors.website).toEqual(['Must be on example.com']);
    });

    it('a container count failure suppresses the rules on the same container', async () => {
        const { errors } = await parseFields(
            { sections: [{ _id: 'a1' }] },
            [
                field({
                    name: 'sections',
                    type: 'repeater',
                    min: 2,
                    fields: [field({ name: 'title', type: 'text' })],
                    validation: [{ minLength: 3 }],
                }),
            ],
            fakeCtx()
        );
        expect(errors.sections).toEqual(['Must have at least 2 items']);
    });
});

// ---------------------------------------------------------------------------
// Rule: unique
// ---------------------------------------------------------------------------

describe('rule: unique', () => {
    it('isUnique returns true → no error', async () => {
        const isUnique = vi.fn(async () => true);
        const { errors } = await parseFields(
            { slug: 'my-slug' },
            [field({ name: 'slug', type: 'text', validation: [{ unique: true }] })],
            fakeCtx({ lookups: { isUnique } })
        );
        expect(errors.slug).toBeUndefined();
        expect(isUnique).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'slug' }),
            'my-slug'
        );
    });

    it('isUnique returns false → ["Already in use"]', async () => {
        const isUnique = vi.fn(async () => false);
        const { errors } = await parseFields(
            { slug: 'taken-slug' },
            [field({ name: 'slug', type: 'text', validation: [{ unique: true }] })],
            fakeCtx({ lookups: { isUnique } })
        );
        expect(errors.slug).toEqual(['Already in use']);
        expect(isUnique).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'slug' }),
            'taken-slug'
        );
    });
});

// ---------------------------------------------------------------------------
// Rule: custom
// ---------------------------------------------------------------------------

describe('rule: custom', () => {
    it('custom returns true → no error', async () => {
        const { errors } = await parseFields(
            { value: 'ok' },
            [
                field({
                    name: 'value',
                    type: 'text',
                    validation: [{ custom: async () => true }],
                }),
            ],
            fakeCtx()
        );
        expect(errors.value).toBeUndefined();
    });

    it('custom returns string → that message', async () => {
        const { errors } = await parseFields(
            { value: 'bad' },
            [
                field({
                    name: 'value',
                    type: 'text',
                    validation: [{ custom: async () => 'Custom error message' }],
                }),
            ],
            fakeCtx()
        );
        expect(errors.value).toEqual(['Custom error message']);
    });

    it('custom returns false (non-true non-string) → "Invalid value"', async () => {
        const { errors } = await parseFields(
            { value: 'bad' },
            [
                field({
                    name: 'value',
                    type: 'text',
                    // @ts-expect-error intentionally returning false to test fallback
                    validation: [{ custom: async () => false }],
                }),
            ],
            fakeCtx()
        );
        expect(errors.value).toEqual(['Invalid value']);
    });

    it('custom can read siblings via ctx.values', async () => {
        let capturedValues: Record<string, unknown> | undefined;
        const { errors } = await parseFields(
            { password: 'secret', confirm: 'secret' },
            [
                field({ name: 'password', type: 'text' }),
                field({
                    name: 'confirm',
                    type: 'text',
                    validation: [
                        {
                            custom: async (ctx: FieldValidationContext) => {
                                capturedValues = ctx.values;
                                return (
                                    ctx.value === ctx.values.password ||
                                    'Passwords do not match'
                                );
                            },
                        },
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors.confirm).toBeUndefined();
        expect(capturedValues?.password).toBe('secret');
    });

    it('custom can detect mismatch via ctx.values', async () => {
        const { errors } = await parseFields(
            { password: 'secret', confirm: 'wrong' },
            [
                field({ name: 'password', type: 'text' }),
                field({
                    name: 'confirm',
                    type: 'text',
                    validation: [
                        {
                            custom: async (ctx: FieldValidationContext) =>
                                ctx.value === ctx.values.password ||
                                'Passwords do not match',
                        },
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors.confirm).toEqual(['Passwords do not match']);
    });
});

// ---------------------------------------------------------------------------
// Layout flattening
// ---------------------------------------------------------------------------

describe('layout flattening', () => {
    it('section wrapping a required field → error keyed by inner field name', async () => {
        const { errors } = await parseFields(
            {},
            [
                field({
                    name: 'meta',
                    type: 'section',
                    fields: [field({ name: 'title', type: 'text', required: true })],
                }),
            ],
            fakeCtx()
        );
        expect(errors.title).toEqual(['This field is required']);
        expect(errors.meta).toBeUndefined();
    });

    it('nested sections are fully unwrapped', async () => {
        const { errors } = await parseFields(
            {},
            [
                field({
                    name: 'outer',
                    type: 'section',
                    fields: [
                        field({
                            name: 'inner',
                            type: 'section',
                            fields: [
                                field({ name: 'deep', type: 'text', required: true }),
                            ],
                        }),
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors.deep).toEqual(['This field is required']);
    });
});

// ---------------------------------------------------------------------------
// Nested fields — keyed by path, never by bare child name
// ---------------------------------------------------------------------------

describe('nested fields', () => {
    /**
     * Containers ARE recursed (see pipeline-nested.test.ts for the full matrix).
     * What matters here is that recursion never leaks a child's bare name into
     * the top-level error keys — a nested error always carries its path.
     */
    it('group child required but absent → error keyed by path, not bare name', async () => {
        const { errors } = await parseFields(
            {},
            [
                field({
                    name: 'address',
                    type: 'group',
                    fields: [field({ name: 'postcode', type: 'text', required: true })],
                }),
            ],
            fakeCtx()
        );
        expect(errors['address.postcode']).toEqual(['This field is required']);
        expect(errors.postcode).toBeUndefined();
        // The group itself is not required, so no error on the container.
        expect(errors.address).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Unknown keys & clean state
// ---------------------------------------------------------------------------

describe('unknown keys', () => {
    it('a key matching no declared field is dropped', async () => {
        const { values, errors } = await parseFields(
            { title: 'hello', _unknownKey: 'dropped' },
            [field({ name: 'title', type: 'text' })],
            fakeCtx()
        );
        expect(values).toEqual({ title: 'hello' });
        expect(errors).toEqual({});
    });

    it('a field declared inside a layout field is kept', async () => {
        const { values } = await parseFields(
            { title: 'hello', stray: 1 },
            [
                field({
                    name: 'main',
                    type: 'tabs',
                    fields: [field({ name: 'title', type: 'text' })],
                }),
            ],
            fakeCtx()
        );
        expect(values).toEqual({ title: 'hello' });
    });

    it('empty definitions drop nothing — the schema is unknown, not empty', async () => {
        const input = { title: 'hello' };
        const { values } = await parseFields(input, [], fakeCtx());
        expect(values).toEqual({ title: 'hello' });
        expect(values).not.toBe(input);
    });

    it('a declared field absent from the input stays absent', async () => {
        const { values } = await parseFields(
            { title: 'hello' },
            [
                field({ name: 'title', type: 'text' }),
                field({ name: 'body', type: 'text' }),
            ],
            fakeCtx({ operation: 'update' })
        );
        expect(values).toEqual({ title: 'hello' });
    });
});

describe('clean state', () => {
    it('all-valid input → errors is {}', async () => {
        const { errors } = await parseFields(
            { title: 'hello', count: 5 },
            [
                field({ name: 'title', type: 'text', validation: [{ minLength: 2 }] }),
                field({
                    name: 'count',
                    type: 'number',
                    validation: [{ min: 1 }, { max: 10 }],
                }),
            ],
            fakeCtx()
        );
        expect(errors).toEqual({});
    });
});
