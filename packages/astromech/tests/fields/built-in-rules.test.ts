import { describe, expect, it } from 'vitest';
import type { FieldValidationContext } from '@/types/fields.js';
import {
    coerceEmail,
    validateEmail,
    coerceUrl,
    validateUrl,
    coerceSlug,
    isJsonValue,
    validateJson,
    coerceKeyValue,
    validateKeyValue,
} from '@/fields/built-in-rules.js';
import { processFields } from '@/fields/pipeline.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ctx(value: unknown): FieldValidationContext {
    return {
        value,
        values: {},
        field: { name: 'f', type: 'x' },
        path: ['f'],
        operation: 'create',
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
// email
// ---------------------------------------------------------------------------

describe('coerceEmail', () => {
    it('trims a string', () => {
        expect(coerceEmail('  user@example.com  ')).toBe('user@example.com');
    });

    it('passes through non-strings unchanged', () => {
        expect(coerceEmail(42)).toBe(42);
        expect(coerceEmail(null)).toBe(null);
        expect(coerceEmail(undefined)).toBe(undefined);
    });
});

describe('validateEmail', () => {
    it('accepts a valid email', async () => {
        expect(await validateEmail(ctx('user@example.com'))).toBe(true);
    });

    it('rejects an invalid email with the exact message', async () => {
        expect(await validateEmail(ctx('nope'))).toBe('Must be a valid email address');
    });

    it('rejects an email missing domain', async () => {
        expect(await validateEmail(ctx('user@'))).toBe('Must be a valid email address');
    });

    it('rejects a non-string', async () => {
        expect(await validateEmail(ctx(42))).toBe('Must be a valid email address');
    });
});

// ---------------------------------------------------------------------------
// url
// ---------------------------------------------------------------------------

describe('coerceUrl', () => {
    it('trims a string', () => {
        expect(coerceUrl('  https://example.com  ')).toBe('https://example.com');
    });

    it('passes through non-strings unchanged', () => {
        expect(coerceUrl(null)).toBe(null);
        expect(coerceUrl(undefined)).toBe(undefined);
    });
});

describe('validateUrl', () => {
    it('accepts a valid URL', async () => {
        expect(await validateUrl(ctx('https://example.com'))).toBe(true);
    });

    it('rejects an invalid URL with the exact message', async () => {
        expect(await validateUrl(ctx('not-a-url'))).toBe('Must be a valid URL');
    });

    it('rejects a non-string', async () => {
        expect(await validateUrl(ctx(42))).toBe('Must be a valid URL');
    });
});

// ---------------------------------------------------------------------------
// slug
// ---------------------------------------------------------------------------

describe('coerceSlug', () => {
    it('slugifies a string', () => {
        expect(coerceSlug('My Post!')).toBe('my-post');
    });

    it('is idempotent on an already-valid slug', () => {
        expect(coerceSlug('my-post')).toBe('my-post');
    });

    it('passes through non-strings unchanged', () => {
        expect(coerceSlug(42)).toBe(42);
        expect(coerceSlug(null)).toBe(null);
    });

    it('all-symbols input → empty string (pipeline treats as empty)', () => {
        expect(coerceSlug('!!!')).toBe('');
    });
});

// ---------------------------------------------------------------------------
// isJsonValue / validateJson
// ---------------------------------------------------------------------------

describe('isJsonValue', () => {
    it('null → true', () => expect(isJsonValue(null)).toBe(true));
    it('string → true', () => expect(isJsonValue('hello')).toBe(true));
    it('number (finite) → true', () => expect(isJsonValue(42)).toBe(true));
    it('boolean → true', () => expect(isJsonValue(true)).toBe(true));
    it('nested object → true', () => expect(isJsonValue({ a: 1, b: { c: 'x' } })).toBe(true));
    it('nested array → true', () => expect(isJsonValue([1, 'two', null, false])).toBe(true));
    it('function → false', () => expect(isJsonValue(() => {})).toBe(false));
    it('undefined → false', () => expect(isJsonValue(undefined)).toBe(false));
    it('NaN → false', () => expect(isJsonValue(NaN)).toBe(false));
    it('Infinity → false', () => expect(isJsonValue(Infinity)).toBe(false));
    it('bigint → false', () => expect(isJsonValue(BigInt(1))).toBe(false));
    it('object containing a function value → false', () => {
        expect(isJsonValue({ fn: () => {} })).toBe(false);
    });
});

describe('validateJson', () => {
    it('accepts a valid JSON value (plain object)', async () => {
        expect(await validateJson(ctx({ a: 1 }))).toBe(true);
    });

    it('rejects a function with the exact message', async () => {
        expect(await validateJson(ctx(() => {}))).toBe('Must be valid JSON');
    });

    it('rejects NaN', async () => {
        expect(await validateJson(ctx(NaN))).toBe('Must be valid JSON');
    });
});

// ---------------------------------------------------------------------------
// key-value
// ---------------------------------------------------------------------------

describe('coerceKeyValue', () => {
    it('plain object: filters empty keys and null/undefined values, stringifies non-strings', () => {
        expect(coerceKeyValue({ a: 1, '': 2, b: null, c: undefined, d: 'ok' })).toEqual({
            a: '1',
            d: 'ok',
        });
    });

    it('passes through an array unchanged', () => {
        const arr = [1, 2, 3];
        expect(coerceKeyValue(arr)).toBe(arr);
    });

    it('passes through a string unchanged', () => {
        expect(coerceKeyValue('hello')).toBe('hello');
    });

    it('passes through null unchanged', () => {
        expect(coerceKeyValue(null)).toBe(null);
    });
});

describe('validateKeyValue', () => {
    it('accepts a plain object', async () => {
        expect(await validateKeyValue(ctx({ a: 'b' }))).toBe(true);
    });

    it('rejects an array with the exact message', async () => {
        expect(await validateKeyValue(ctx([]))).toBe('Must be a set of key/value pairs');
    });

    it('rejects a string with the exact message', async () => {
        expect(await validateKeyValue(ctx('hello'))).toBe('Must be a set of key/value pairs');
    });

    it('rejects null with the exact message', async () => {
        expect(await validateKeyValue(ctx(null))).toBe('Must be a set of key/value pairs');
    });
});

// ---------------------------------------------------------------------------
// processFields integration
// ---------------------------------------------------------------------------

describe('processFields integration', () => {
    it('email field with invalid value → errors.f', async () => {
        const { errors } = await processFields(
            { f: 'nope' },
            [{ name: 'f', type: 'email' }],
            fakeCtx(),
        );
        expect(errors.f).toEqual(['Must be a valid email address']);
    });

    it('slug field with "My Post" → values.f is "my-post" and no error', async () => {
        const { values, errors } = await processFields(
            { f: 'My Post' },
            [{ name: 'f', type: 'slug' }],
            fakeCtx(),
        );
        expect(values.f).toBe('my-post');
        expect(errors.f).toBeUndefined();
    });

    it('key-value field with {a:1,"":2} → values.f deep-equals {a:"1"}', async () => {
        const { values } = await processFields(
            { f: { a: 1, '': 2 } },
            [{ name: 'f', type: 'key-value' }],
            fakeCtx(),
        );
        expect(values.f).toEqual({ a: '1' });
    });
});
