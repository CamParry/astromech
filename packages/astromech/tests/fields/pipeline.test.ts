import { describe, expect, it, vi } from 'vitest';
import type { FieldDefinition, FieldValidationContext } from '@/types/fields.js';
import { registerFieldTypeDescriptor } from '@/fields/descriptors.js';
import { processFields } from '@/fields/pipeline.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CtxOverrides = Partial<{
    operation: 'create' | 'update';
    host: { kind: 'entry' | 'media' | 'user' | 'setting'; record: unknown };
    user: null;
    reads: { isUnique: (field: FieldDefinition, value: unknown) => Promise<boolean> };
}>;

function fakeCtx(overrides: CtxOverrides = {}) {
    return {
        operation: 'create' as const,
        host: { kind: 'entry' as const, record: {} },
        user: null,
        reads: { isUnique: async () => true },
        ...overrides,
    };
}

function field(
    def: Partial<FieldDefinition> & { name: string; type: string }
): FieldDefinition {
    return def as FieldDefinition;
}

// ---------------------------------------------------------------------------
// required
// ---------------------------------------------------------------------------

describe('required', () => {
    it('empty + required → error keyed by field name', async () => {
        const { errors } = await processFields(
            { title: '' },
            [field({ name: 'title', type: 'text', required: true })],
            fakeCtx()
        );
        expect(errors.title).toEqual(['This field is required']);
    });

    it('null + required → error', async () => {
        const { errors } = await processFields(
            { title: null },
            [field({ name: 'title', type: 'text', required: true })],
            fakeCtx()
        );
        expect(errors.title).toEqual(['This field is required']);
    });

    it('undefined + required → error', async () => {
        const { errors } = await processFields(
            {},
            [field({ name: 'title', type: 'text', required: true })],
            fakeCtx()
        );
        expect(errors.title).toEqual(['This field is required']);
    });

    it('empty array + required → error', async () => {
        const { errors } = await processFields(
            { tags: [] },
            [field({ name: 'tags', type: 'multiselect', required: true })],
            fakeCtx()
        );
        expect(errors.tags).toEqual(['This field is required']);
    });

    it('empty + optional → no error', async () => {
        const { errors } = await processFields(
            { title: '' },
            [field({ name: 'title', type: 'text' })],
            fakeCtx()
        );
        expect(errors.title).toBeUndefined();
    });

    it('create + absent value with field.defaultValue → default applied, required passes', async () => {
        const { values, errors } = await processFields(
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
// default
// ---------------------------------------------------------------------------

describe('default', () => {
    it('create + absent → field.defaultValue applied', async () => {
        const { values } = await processFields(
            {},
            [field({ name: 'status', type: 'text', defaultValue: 'draft' })],
            fakeCtx({ operation: 'create' })
        );
        expect(values.status).toBe('draft');
    });

    it('type-level fallback: boolean field without field.defaultValue → false', async () => {
        const { values } = await processFields(
            {},
            [field({ name: 'active', type: 'boolean' })],
            fakeCtx({ operation: 'create' })
        );
        expect(values.active).toBe(false);
    });

    it('field.defaultValue wins over descriptor.defaultValue', async () => {
        // boolean descriptor.defaultValue is false; override with true
        const { values } = await processFields(
            {},
            [field({ name: 'active', type: 'boolean', defaultValue: true })],
            fakeCtx({ operation: 'create' })
        );
        expect(values.active).toBe(true);
    });

    it('update + absent → NO default applied', async () => {
        const { values } = await processFields(
            {},
            [field({ name: 'status', type: 'text', defaultValue: 'draft' })],
            fakeCtx({ operation: 'update' })
        );
        expect(values.status).toBeUndefined();
    });

    it('null + create → treated as absent, default applied', async () => {
        const { values } = await processFields(
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
    // Register a throwaway descriptor with a trim coerce fn.
    registerFieldTypeDescriptor({
        type: 't-coerce',
        build: (() => ({})) as never,
        component: '',
        tsType: () => 'string',
        coerce: (x) => String(x).trim(),
    });

    it('trims value via descriptor coerce', async () => {
        const { values } = await processFields(
            { name: '  hello  ' },
            [field({ name: 'name', type: 't-coerce' })],
            fakeCtx()
        );
        expect(values.name).toBe('hello');
    });

    it('coercion happens before validation', async () => {
        const { errors } = await processFields(
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
        const { errors } = await processFields(
            { bio: 'hello' },
            [field({ name: 'bio', type: 'text', validation: [{ minLength: 3 }] })],
            fakeCtx()
        );
        expect(errors.bio).toBeUndefined();
    });

    it('fail: string below min length', async () => {
        const { errors } = await processFields(
            { bio: 'hi' },
            [field({ name: 'bio', type: 'text', validation: [{ minLength: 3 }] })],
            fakeCtx()
        );
        expect(errors.bio).toEqual(['Must be at least 3 characters']);
    });

    it('pass: array meets min length', async () => {
        const { errors } = await processFields(
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
        const { errors } = await processFields(
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

    it('lenient: non-string/array value returns null (no error)', async () => {
        const { errors } = await processFields(
            { count: 1 },
            [field({ name: 'count', type: 'number', validation: [{ minLength: 5 }] })],
            fakeCtx()
        );
        expect(errors.count).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Rule: maxLength
// ---------------------------------------------------------------------------

describe('rule: maxLength', () => {
    it('pass: string at max length', async () => {
        const { errors } = await processFields(
            { slug: 'hello' },
            [field({ name: 'slug', type: 'text', validation: [{ maxLength: 5 }] })],
            fakeCtx()
        );
        expect(errors.slug).toBeUndefined();
    });

    it('fail: string exceeds max length', async () => {
        const { errors } = await processFields(
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
        const { errors } = await processFields(
            { age: 18 },
            [field({ name: 'age', type: 'number', validation: [{ min: 18 }] })],
            fakeCtx()
        );
        expect(errors.age).toBeUndefined();
    });

    it('fail: number below minimum', async () => {
        const { errors } = await processFields(
            { age: 16 },
            [field({ name: 'age', type: 'number', validation: [{ min: 18 }] })],
            fakeCtx()
        );
        expect(errors.age).toEqual(['Must be at least 18']);
    });

    it('lenient: non-number value → no error', async () => {
        const { errors } = await processFields(
            { age: 'old' },
            [field({ name: 'age', type: 'text', validation: [{ min: 18 }] })],
            fakeCtx()
        );
        expect(errors.age).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Rule: max
// ---------------------------------------------------------------------------

describe('rule: max', () => {
    it('pass: number at maximum', async () => {
        const { errors } = await processFields(
            { score: 100 },
            [field({ name: 'score', type: 'number', validation: [{ max: 100 }] })],
            fakeCtx()
        );
        expect(errors.score).toBeUndefined();
    });

    it('fail: number exceeds maximum', async () => {
        const { errors } = await processFields(
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
        const { errors } = await processFields(
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
        const { errors } = await processFields(
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
        const { errors } = await processFields(
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
        const { errors } = await processFields(
            { email: 'user@example.com' },
            [field({ name: 'email', type: 'text', validation: [{ email: true }] })],
            fakeCtx()
        );
        expect(errors.email).toBeUndefined();
    });

    it('fail: invalid email', async () => {
        const { errors } = await processFields(
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
        const { errors } = await processFields(
            { website: 'https://example.com' },
            [field({ name: 'website', type: 'text', validation: [{ url: true }] })],
            fakeCtx()
        );
        expect(errors.website).toBeUndefined();
    });

    it('fail: invalid URL', async () => {
        const { errors } = await processFields(
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
        const { errors } = await processFields(
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
        const { errors } = await processFields(
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
        const { errors } = await processFields(
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
        const { errors } = await processFields(
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
// Multiple errors collected
// ---------------------------------------------------------------------------

describe('multiple errors', () => {
    it('both minLength and pattern fail → 2 messages collected', async () => {
        const { errors } = await processFields(
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
        expect(errors.code).toHaveLength(2);
        expect(errors.code).toContain('Must be at least 5 characters');
        expect(errors.code).toContain('Must be uppercase');
    });
});

// ---------------------------------------------------------------------------
// Rule: unique
// ---------------------------------------------------------------------------

describe('rule: unique', () => {
    it('isUnique returns true → no error', async () => {
        const isUnique = vi.fn(async () => true);
        const { errors } = await processFields(
            { slug: 'my-slug' },
            [field({ name: 'slug', type: 'text', validation: [{ unique: true }] })],
            fakeCtx({ reads: { isUnique } })
        );
        expect(errors.slug).toBeUndefined();
        expect(isUnique).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'slug' }),
            'my-slug'
        );
    });

    it('isUnique returns false → ["Already in use"]', async () => {
        const isUnique = vi.fn(async () => false);
        const { errors } = await processFields(
            { slug: 'taken-slug' },
            [field({ name: 'slug', type: 'text', validation: [{ unique: true }] })],
            fakeCtx({ reads: { isUnique } })
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
        const { errors } = await processFields(
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
        const { errors } = await processFields(
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
        const { errors } = await processFields(
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
        const { errors } = await processFields(
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
        const { errors } = await processFields(
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
        const { errors } = await processFields(
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
        const { errors } = await processFields(
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
// Data containers — keyed by path, never by bare child name
// ---------------------------------------------------------------------------

describe('data containers', () => {
    /**
     * Containers ARE recursed (see pipeline-nested.test.ts for the full matrix).
     * What matters here is that recursion never leaks a child's bare name into
     * the top-level error keys — a nested error always carries its path.
     */
    it('group child required but absent → error keyed by path, not bare name', async () => {
        const { errors } = await processFields(
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
// Passthrough & clean state
// ---------------------------------------------------------------------------

describe('passthrough', () => {
    it('unknown keys in values survive into returned values', async () => {
        const { values } = await processFields(
            { title: 'hello', _unknownKey: 'preserved' },
            [field({ name: 'title', type: 'text' })],
            fakeCtx()
        );
        expect(values._unknownKey).toBe('preserved');
    });

    it('all-valid input → errors is {}', async () => {
        const { errors } = await processFields(
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
