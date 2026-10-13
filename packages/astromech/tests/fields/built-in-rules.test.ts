import type { Field, FieldValidationContext } from '@/types/fields';
import { describe, expect, it } from 'vitest';
import {
    coerceDate,
    coerceDatetime,
    coerceEmail,
    coerceKeyValue,
    coerceNumber,
    coerceUrl,
    isJsonValue,
    validateBoolean,
    validateChoice,
    validateColor,
    validateDate,
    validateDatetime,
    validateEmail,
    validateGroup,
    validateItemList,
    validateJson,
    validateKeyValue,
    validateLink,
    validateMultiChoice,
    validateNumber,
    validateReference,
    validateSlug,
    validateText,
    validateUrl,
} from '@/fields/built-in-rules';
import { safeParseFields } from '@/fields/parse-fields';

function ctx(value: unknown): FieldValidationContext {
    return {
        value,
        values: {},
        field: { name: 'f', type: 'x' },
        path: [{ kind: 'field', name: 'f' }],
        operation: 'create',
        validation: 'complete',
        resource: { kind: 'entry', record: null },
        user: null,
    };
}

function fakeCtx() {
    return {
        operation: 'create' as const,
        resource: { kind: 'entry' as const, record: null },
        user: null,
    };
}

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

describe('validateSlug', () => {
    it('an already-normal slug → true', async () => {
        expect(await validateSlug(ctx('my-post'))).toBe(true);
        expect(await validateSlug(ctx('post-2'))).toBe(true);
    });

    it('a value normalization would change → rejected, with the suggestion', async () => {
        expect(await validateSlug(ctx('My Post!'))).toBe(
            "Must be lowercase letters, numbers and hyphens: try 'my-post'"
        );
    });

    it('leading or trailing hyphens → rejected', async () => {
        expect(await validateSlug(ctx('-my-post-'))).toBe(
            "Must be lowercase letters, numbers and hyphens: try 'my-post'"
        );
    });

    it('nothing survives normalization → rejected without a suggestion', async () => {
        expect(await validateSlug(ctx('!!!'))).toBe(
            'Must be lowercase letters, numbers and hyphens'
        );
    });

    it('a non-string → rejected as text', async () => {
        expect(await validateSlug(ctx(42))).toBe('Must be text');
    });
});

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

describe('safeParseFields integration', () => {
    it('email field with invalid value → errors.f', async () => {
        const { errors } = await safeParseFields(
            { f: 'nope' },
            [{ name: 'f', type: 'email' }],
            fakeCtx()
        );
        expect(errors.f).toEqual(['Must be a valid email address']);
    });

    it('slug field with "My Post" → errors.f, and the value is left alone', async () => {
        const { values, errors } = await safeParseFields(
            { f: 'My Post' },
            [{ name: 'f', type: 'slug' }],
            fakeCtx()
        );
        expect(values.f).toBe('My Post');
        expect(errors.f).toEqual([
            "Must be lowercase letters, numbers and hyphens: try 'my-post'",
        ]);
    });

    it('slug field with an already-normal value → no error', async () => {
        const { values, errors } = await safeParseFields(
            { f: 'my-post' },
            [{ name: 'f', type: 'slug' }],
            fakeCtx()
        );
        expect(values.f).toBe('my-post');
        expect(errors.f).toBeUndefined();
    });

    it('color field with a keyword → errors.f', async () => {
        const { errors } = await safeParseFields(
            { f: 'red' },
            [{ name: 'f', type: 'color' }],
            fakeCtx()
        );
        expect(errors.f).toEqual([
            'Must be a hex colour such as #3366ff, or an rgb()/hsl() colour',
        ]);
    });

    it('link field with a javascript: url → errors.f', async () => {
        const { errors } = await safeParseFields(
            { f: { url: 'javascript:alert(1)', label: 'Go' } },
            [{ name: 'f', type: 'link' }],
            fakeCtx()
        );
        expect(errors.f).toEqual(['A link may not use a javascript: or data: url']);
    });

    it('key-value field with {a:1,"":2} → values.f deep-equals {a:"1"}', async () => {
        const { values } = await safeParseFields(
            { f: { a: 1, '': 2 } },
            [{ name: 'f', type: 'key-value' }],
            fakeCtx()
        );
        expect(values.f).toEqual({ a: '1' });
    });
});

describe('validateChoice', () => {
    const field: Field = {
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
        const plain: Field = { name: 'f', type: 'select', options: ['x', 'y'] };
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
    const field: Field = {
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
    it('converts a Date to its UTC date', () => {
        expect(coerceDate(new Date('2026-01-02T23:04:05.000-05:00'))).toBe('2026-01-03');
    });

    it('leaves an invalid Date for the validator to reject', () => {
        expect(coerceDate(new Date('nope'))).toBeInstanceOf(Date);
    });

    it('keeps a YYYY-MM-DD date', () => {
        expect(coerceDate('2026-01-02')).toBe('2026-01-02');
    });

    // The form a date was stored in before core kept YYYY-MM-DD only. The date
    // is the one the value is written with, not the UTC one (2026-10-11 here).
    it('converts an ISO date-time to the date it is written with', () => {
        expect(coerceDate('2026-10-10T23:30:00-05:00')).toBe('2026-10-10');
        expect(coerceDate('2026-10-10T00:00:00.000Z')).toBe('2026-10-10');
        expect(coerceDate('2026-10-10T10:00')).toBe('2026-10-10');
    });

    it('reads a date-time with a basic-format offset the same way', () => {
        expect(coerceDate('2026-10-10T23:30:00-0500')).toBe('2026-10-10');
    });

    it('leaves any other string for the validator to reject', () => {
        for (const value of ['Oct 10 2026', '2026-02-30T10:00', '2026-10-10 10:00Z']) {
            expect(coerceDate(value)).toBe(value);
        }
    });
});

describe('validateDate', () => {
    it('accepts a calendar date as YYYY-MM-DD', async () => {
        expect(await validateDate(ctx('2026-01-02'))).toBe(true);
        expect(await validateDate(ctx('2028-02-29'))).toBe(true);
    });

    // The form a date was stored in before. A sent one is coerced to its date
    // first, so the rule sees it only as a stored value a patch left out.
    it('accepts an ISO date-time', async () => {
        expect(await validateDate(ctx('2026-01-02T03:04:05.000Z'))).toBe(true);
        expect(await validateDate(ctx('2026-10-10T23:30:00-05:00'))).toBe(true);
        expect(await validateDate(ctx('2026-10-10T23:30:00-0500'))).toBe(true);
    });

    it('rejects any other form, including ones Date.parse reads', async () => {
        for (const value of [
            'not a date',
            'Oct 10 2026',
            '2026-10-10 10:00Z',
            '2026-02-30',
        ]) {
            expect(await validateDate(ctx(value))).toBe('Must be a date as YYYY-MM-DD');
        }
    });

    it('rejects a non-string', async () => {
        expect(await validateDate(ctx(1735689600000))).toBe('Must be a date');
    });
});

describe('coerceDatetime', () => {
    it('converts a Date to UTC', () => {
        expect(coerceDatetime(new Date('2026-01-02T03:04:05.000Z'))).toBe(
            '2026-01-02T03:04:05.000Z'
        );
    });

    it('stores a value with a zone as UTC to the millisecond', () => {
        expect(coerceDatetime('2026-10-10T10:00:00+02:00')).toBe(
            '2026-10-10T08:00:00.000Z'
        );
        expect(coerceDatetime('2026-10-10T10:00Z')).toBe('2026-10-10T10:00:00.000Z');
        expect(coerceDatetime('2026-10-10T10:00:00.123456-01:30')).toBe(
            '2026-10-10T11:30:00.123Z'
        );
    });

    it('reads a basic-format offset as the same zone', () => {
        expect(coerceDatetime('2026-10-10T10:00:00+0200')).toBe(
            '2026-10-10T08:00:00.000Z'
        );
        expect(coerceDatetime('2026-10-10T10:00-0130')).toBe('2026-10-10T11:30:00.000Z');
    });

    // Read as UTC it would move by the server's offset; read in the server's
    // zone it would move by the server's zone. Neither is the author's.
    it('keeps the wall time of a value without a zone, to the millisecond', () => {
        expect(coerceDatetime('2026-10-10T10:00')).toBe('2026-10-10T10:00');
        expect(coerceDatetime('2026-10-10T10:00:30.5')).toBe('2026-10-10T10:00:30.5');
        expect(coerceDatetime('2026-10-10T10:00:30.123456')).toBe(
            '2026-10-10T10:00:30.123'
        );
    });

    it('keeps a bare date', () => {
        expect(coerceDatetime('2026-10-10')).toBe('2026-10-10');
    });

    it('leaves what it cannot read for the validator to reject', () => {
        expect(coerceDatetime('Oct 10 2026')).toBe('Oct 10 2026');
        expect(coerceDatetime(new Date('nope'))).toBeInstanceOf(Date);
    });
});

describe('validateDatetime', () => {
    it('accepts an ISO 8601 date and time, with or without a zone, and a bare date', async () => {
        for (const value of [
            '2026-10-10T10:00',
            '2026-10-10T10:00:00.000Z',
            '2026-10-10T10:00:00+02:00',
            '2026-10-10',
        ]) {
            expect(await validateDatetime(ctx(value))).toBe(true);
        }
    });

    // Stored before core kept these forms. A sent one is coerced to UTC first,
    // so the rule sees it only as a stored value a patch left out.
    it('accepts a basic-format offset', async () => {
        expect(await validateDatetime(ctx('2026-10-10T10:00:00+0200'))).toBe(true);
        expect(await validateDatetime(ctx('2026-10-10T10:00-0130'))).toBe(true);
    });

    it('rejects any other form, including ones Date.parse reads', async () => {
        for (const value of [
            'not a date',
            'Oct 10 2026',
            '2026-10-10 10:00:00Z',
            '2026-10-10T10:00:00+2400',
            '2026-02-30T10:00',
        ]) {
            expect(await validateDatetime(ctx(value))).toBe(
                'Must be an ISO 8601 date and time, such as 2026-10-10T14:30'
            );
        }
    });

    it('rejects a non-string', async () => {
        expect(await validateDatetime(ctx(1735689600000))).toBe(
            'Must be a date and time'
        );
    });
});

describe('validateReference', () => {
    const single: Field = { name: 'f', type: 'relationship', target: 'post' };
    const many: Field = {
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

    // The type check runs only where `entryTypes` is supplied. Existence never
    // decides a reference: a dangling id is pruned by the write pipeline.
    describe('target type', () => {
        const typesOf =
            (rows: Record<string, string>) =>
            async (ids: string[]): Promise<Map<string, string>> =>
                new Map(
                    ids.filter((id) => id in rows).map((id) => [id, rows[id]!] as const)
                );

        it('accepts an id of the declared target type', async () => {
            expect(
                await validateReference({
                    ...ctx('abc'),
                    field: single,
                    entryTypes: typesOf({ abc: 'post' }),
                })
            ).toBe(true);
        });

        it('rejects an id resolving to another type', async () => {
            expect(
                await validateReference({
                    ...ctx('abc'),
                    field: single,
                    entryTypes: typesOf({ abc: 'author' }),
                })
            ).toBe('"f" expects a post, but "abc" is a author');
        });

        it('rejects the wrong type inside a multiple list', async () => {
            expect(
                await validateReference({
                    ...ctx(['a', 'b']),
                    field: many,
                    entryTypes: typesOf({ a: 'post', b: 'author' }),
                })
            ).toBe('"f" expects a post, but "b" is a author');
        });

        it('accepts a dangling id — no entry row to disagree with', async () => {
            expect(
                await validateReference({
                    ...ctx('gone'),
                    field: single,
                    entryTypes: typesOf({}),
                })
            ).toBe(true);
        });

        it('skips the check when the caller supplies no entryTypes', async () => {
            expect(
                await validateReference({
                    ...ctx('abc'),
                    field: single,
                })
            ).toBe(true);
        });

        it('leaves a media field shape-checked only', async () => {
            expect(
                await validateReference({
                    ...ctx('abc'),
                    field: { name: 'f', type: 'media' },
                    entryTypes: typesOf({ abc: 'post' }),
                })
            ).toBe(true);
        });

        it('skips a relationship declaring no target', async () => {
            expect(
                await validateReference({
                    ...ctx('abc'),
                    field: { name: 'f', type: 'relationship' },
                    entryTypes: typesOf({ abc: 'post' }),
                })
            ).toBe(true);
        });
    });
});

describe('validateText', () => {
    it('accepts a string', async () => {
        expect(await validateText(ctx('hello'))).toBe(true);
    });

    it('rejects a non-string', async () => {
        expect(await validateText(ctx(1))).toBe('Must be text');
        expect(await validateText(ctx({}))).toBe('Must be text');
    });
});

describe('validateColor', () => {
    it('accepts hex in every length', async () => {
        expect(await validateColor(ctx('#fff'))).toBe(true);
        expect(await validateColor(ctx('#ffff'))).toBe(true);
        expect(await validateColor(ctx('#3366ff'))).toBe(true);
        expect(await validateColor(ctx('#3366FF80'))).toBe(true);
    });

    it('accepts the rgb/hsl functions', async () => {
        expect(await validateColor(ctx('rgb(51, 102, 255)'))).toBe(true);
        expect(await validateColor(ctx('rgba(51, 102, 255, 0.5)'))).toBe(true);
        expect(await validateColor(ctx('hsl(220 100% 60%)'))).toBe(true);
    });

    it('rejects a malformed hex value', async () => {
        expect(await validateColor(ctx('#12345'))).toBe(
            'Must be a hex colour such as #3366ff, or an rgb()/hsl() colour'
        );
        expect(await validateColor(ctx('3366ff'))).toBe(
            'Must be a hex colour such as #3366ff, or an rgb()/hsl() colour'
        );
    });

    it('rejects a keyword', async () => {
        expect(await validateColor(ctx('red'))).toBe(
            'Must be a hex colour such as #3366ff, or an rgb()/hsl() colour'
        );
    });

    it('rejects a non-string', async () => {
        expect(await validateColor(ctx(255))).toBe('Must be text');
    });
});

describe('validateLink', () => {
    it('accepts a link with a url', async () => {
        expect(await validateLink(ctx({ url: '/about', label: 'About' }))).toBe(true);
    });

    it('accepts a relative path, an anchor and a mailto', async () => {
        expect(await validateLink(ctx({ url: '#top' }))).toBe(true);
        expect(await validateLink(ctx({ url: 'about/team' }))).toBe(true);
        expect(await validateLink(ctx({ url: 'mailto:hi@example.com' }))).toBe(true);
        expect(await validateLink(ctx({ url: 'https://example.com/a?b=c' }))).toBe(true);
    });

    it('accepts an empty url — unfilled is `required`’s question', async () => {
        expect(await validateLink(ctx({ url: '', label: 'About' }))).toBe(true);
    });

    it('rejects a url that does not parse', async () => {
        expect(await validateLink(ctx({ url: 'not a url' }))).toBe('Must be a valid URL');
        expect(await validateLink(ctx({ url: 'https://' }))).toBe('Must be a valid URL');
    });

    it('rejects an executable scheme, as rich text does', async () => {
        expect(await validateLink(ctx({ url: 'javascript:alert(1)' }))).toBe(
            'A link may not use a javascript: or data: url'
        );
        expect(await validateLink(ctx({ url: 'data:text/html;base64,PHA+' }))).toBe(
            'A link may not use a javascript: or data: url'
        );
    });

    it('rejects a bare string', async () => {
        expect(await validateLink(ctx('/about'))).toBe('Must be a link');
    });

    it('rejects a link with no url', async () => {
        expect(await validateLink(ctx({ label: 'About' }))).toBe('A link needs a url');
    });

    it('rejects a non-string label', async () => {
        expect(await validateLink(ctx({ url: '/x', label: 2 }))).toBe(
            'A link label must be text'
        );
    });
});

describe('validateGroup', () => {
    it('accepts an object', async () => {
        expect(await validateGroup(ctx({ a: 1 }))).toBe(true);
    });

    it('rejects an array and a scalar', async () => {
        expect(await validateGroup(ctx([]))).toBe('Must be a group of fields');
        expect(await validateGroup(ctx('x'))).toBe('Must be a group of fields');
    });
});

describe('validateItemList', () => {
    it('accepts an array', async () => {
        expect(await validateItemList(ctx([{ a: 1 }]))).toBe(true);
    });

    it('rejects a non-array', async () => {
        expect(await validateItemList(ctx({}))).toBe('Must be a list of items');
    });
});
