import { describe, expect, it } from 'vitest';
import type { FieldDefinition, FieldValidationContext } from '@/types/fields.js';
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
    validateChoice,
    validateMultiChoice,
    coerceNumber,
    validateNumber,
    validateBoolean,
    coerceDate,
    validateDate,
    validateReference,
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
        path: [{ kind: 'field', name: 'f' }],
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
    it('nested object → true', () =>
        expect(isJsonValue({ a: 1, b: { c: 'x' } })).toBe(true));
    it('nested array → true', () =>
        expect(isJsonValue([1, 'two', null, false])).toBe(true));
    it('function → false', () => expect(isJsonValue(() => undefined)).toBe(false));
    it('undefined → false', () => expect(isJsonValue(undefined)).toBe(false));
    it('NaN → false', () => expect(isJsonValue(NaN)).toBe(false));
    it('Infinity → false', () => expect(isJsonValue(Infinity)).toBe(false));
    it('bigint → false', () => expect(isJsonValue(BigInt(1))).toBe(false));
    it('object containing a function value → false', () => {
        expect(isJsonValue({ fn: () => undefined })).toBe(false);
    });
});

describe('validateJson', () => {
    it('accepts a valid JSON value (plain object)', async () => {
        expect(await validateJson(ctx({ a: 1 }))).toBe(true);
    });

    it('rejects a function with the exact message', async () => {
        expect(await validateJson(ctx(() => undefined))).toBe('Must be valid JSON');
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
        expect(await validateKeyValue(ctx('hello'))).toBe(
            'Must be a set of key/value pairs'
        );
    });

    it('rejects null with the exact message', async () => {
        expect(await validateKeyValue(ctx(null))).toBe(
            'Must be a set of key/value pairs'
        );
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
            fakeCtx()
        );
        expect(errors.f).toEqual(['Must be a valid email address']);
    });

    it('slug field with "My Post" → values.f is "my-post" and no error', async () => {
        const { values, errors } = await processFields(
            { f: 'My Post' },
            [{ name: 'f', type: 'slug' }],
            fakeCtx()
        );
        expect(values.f).toBe('my-post');
        expect(errors.f).toBeUndefined();
    });

    it('key-value field with {a:1,"":2} → values.f deep-equals {a:"1"}', async () => {
        const { values } = await processFields(
            { f: { a: 1, '': 2 } },
            [{ name: 'f', type: 'key-value' }],
            fakeCtx()
        );
        expect(values.f).toEqual({ a: '1' });
    });
});

// ---------------------------------------------------------------------------
// choice
// ---------------------------------------------------------------------------

describe('validateChoice', () => {
    const field: FieldDefinition = {
        name: 'f',
        type: 'select',
        options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
        ],
    };

    it('accepts a declared option', async () => {
        expect(await validateChoice({ ...ctx('a'), field })).toBe(true);
    });

    it('rejects a value that is not a declared option', async () => {
        expect(await validateChoice({ ...ctx('z'), field })).toBe(
            'Must be one of the available options'
        );
    });

    it('accepts anything when the field declares no options', async () => {
        expect(await validateChoice(ctx('z'))).toBe(true);
    });

    it('accepts a plain string option list', async () => {
        const plain: FieldDefinition = { name: 'f', type: 'select', options: ['x', 'y'] };
        expect(await validateChoice({ ...ctx('x'), field: plain })).toBe(true);
        expect(await validateChoice({ ...ctx('z'), field: plain })).toBe(
            'Must be one of the available options'
        );
    });

    it('rejects a non-string', async () => {
        expect(await validateChoice({ ...ctx(1), field })).toBe(
            'Must be one of the available options'
        );
    });
});

describe('validateMultiChoice', () => {
    const field: FieldDefinition = {
        name: 'f',
        type: 'multiselect',
        options: ['a', 'b'],
    };

    it('accepts a list drawn from the options', async () => {
        expect(await validateMultiChoice({ ...ctx(['a', 'b']), field })).toBe(true);
    });

    it('rejects a list containing an undeclared option', async () => {
        expect(await validateMultiChoice({ ...ctx(['a', 'z']), field })).toBe(
            'Must be one of the available options'
        );
    });

    it('rejects a non-array', async () => {
        expect(await validateMultiChoice({ ...ctx('a'), field })).toBe(
            'Must be a list of options'
        );
    });

    it('rejects a non-string item', async () => {
        expect(await validateMultiChoice({ ...ctx([1]), field })).toBe(
            'Must be a list of options'
        );
    });
});

// ---------------------------------------------------------------------------
// number, boolean, date
// ---------------------------------------------------------------------------

describe('coerceNumber', () => {
    it('parses a numeric string', () => {
        expect(coerceNumber('42')).toBe(42);
        expect(coerceNumber(' 3.5 ')).toBe(3.5);
    });

    it('maps an empty string to null', () => {
        expect(coerceNumber('')).toBe(null);
    });

    it('leaves a non-numeric string for the validator to reject', () => {
        expect(coerceNumber('abc')).toBe('abc');
    });

    it('passes through non-strings unchanged', () => {
        expect(coerceNumber(7)).toBe(7);
        expect(coerceNumber(null)).toBe(null);
    });
});

describe('validateNumber', () => {
    it('accepts a finite number', async () => {
        expect(await validateNumber(ctx(0))).toBe(true);
        expect(await validateNumber(ctx(-2.5))).toBe(true);
    });

    it('rejects a string, NaN and Infinity', async () => {
        expect(await validateNumber(ctx('42'))).toBe('Must be a number');
        expect(await validateNumber(ctx(NaN))).toBe('Must be a number');
        expect(await validateNumber(ctx(Infinity))).toBe('Must be a number');
    });
});

describe('validateBoolean', () => {
    it('accepts true and false', async () => {
        expect(await validateBoolean(ctx(true))).toBe(true);
        expect(await validateBoolean(ctx(false))).toBe(true);
    });

    it('rejects a truthy non-boolean', async () => {
        expect(await validateBoolean(ctx('true'))).toBe('Must be true or false');
        expect(await validateBoolean(ctx(1))).toBe('Must be true or false');
    });
});

describe('coerceDate', () => {
    it('converts a Date to an ISO string', () => {
        expect(coerceDate(new Date('2026-01-02T03:04:05.000Z'))).toBe(
            '2026-01-02T03:04:05.000Z'
        );
    });

    it('leaves an invalid Date for the validator to reject', () => {
        expect(coerceDate(new Date('nope'))).toBeInstanceOf(Date);
    });

    it('passes through strings unchanged', () => {
        expect(coerceDate('2026-01-02')).toBe('2026-01-02');
    });
});

describe('validateDate', () => {
    it('accepts a parseable date string', async () => {
        expect(await validateDate(ctx('2026-01-02'))).toBe(true);
        expect(await validateDate(ctx('2026-01-02T03:04:05.000Z'))).toBe(true);
    });

    it('rejects an unparseable string', async () => {
        expect(await validateDate(ctx('not a date'))).toBe('Must be a valid date');
    });

    it('rejects a non-string', async () => {
        expect(await validateDate(ctx(1735689600000))).toBe('Must be a date');
    });
});

// ---------------------------------------------------------------------------
// reference
// ---------------------------------------------------------------------------

describe('validateReference', () => {
    const single: FieldDefinition = { name: 'f', type: 'relationship', target: 'post' };
    const many: FieldDefinition = {
        name: 'f',
        type: 'relationship',
        target: 'post',
        multiple: true,
    };

    it('accepts an id', async () => {
        expect(await validateReference({ ...ctx('abc'), field: single })).toBe(true);
    });

    it('accepts a list of ids when multiple', async () => {
        expect(await validateReference({ ...ctx(['a', 'b']), field: many })).toBe(true);
    });

    // The populated write-back: read with populate, send the object straight back.
    it('rejects a populated record and says so', async () => {
        expect(
            await validateReference({ ...ctx({ id: 'abc', title: 'X' }), field: single })
        ).toBe('Must be an id, not a populated record');
    });

    it('rejects a list of populated records', async () => {
        expect(await validateReference({ ...ctx([{ id: 'abc' }]), field: many })).toBe(
            'Must be a list of ids, not a populated record'
        );
    });

    it('rejects a bare id where a list is expected', async () => {
        expect(await validateReference({ ...ctx('abc'), field: many })).toBe(
            'Must be a list of ids'
        );
    });
});
