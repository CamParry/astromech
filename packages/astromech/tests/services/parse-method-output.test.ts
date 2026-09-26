/**
 * `parseMethodOutput` applies a method's output schema in three tiers: unknown
 * keys are stripped, a key with a fallback that fails takes it and is logged
 * once, and any other failure throws `OutputValidationError`.
 */

import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { OutputValidationError } from '@/errors/output-validation';
import { withFallback } from '@/services/fallback';
import { unparsedJsonObject } from '@/services/json';
import { parseMethodOutput } from '@/services/parse-method-output';

const thing = z.object({
    id: z.string(),
    locale: z.string(),
    role: z.string(),
    image: withFallback(z.string().nullable(), null),
    fields: unparsedJsonObject,
    meta: withFallback(
        z.object({ width: withFallback(z.number().optional(), undefined) }).nullable(),
        null
    ),
});

const method = { name: 'things.get', output: thing };

/** A stored read of `thing`, plus the internal keys a resource carries. */
function resource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: '8f2c',
        locale: 'en',
        role: 'editor',
        image: 'a.png',
        fields: { body: 'text' },
        meta: { width: 10 },
        contentId: 'c1',
        contentCreatedAt: new Date(),
        ...overrides,
    };
}

let logged: MockInstance<typeof console.error>;

beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    logged.mockRestore();
});

/** Every line the core logger wrote during the test. */
function logLines(): string[] {
    return logged.mock.calls.map((call: unknown[]) => call.map(String).join(' '));
}

describe('parseMethodOutput', () => {
    it('strips keys the schema does not declare', () => {
        expect(parseMethodOutput(method, resource())).toEqual({
            id: '8f2c',
            locale: 'en',
            role: 'editor',
            image: 'a.png',
            fields: { body: 'text' },
            meta: { width: 10 },
        });
        expect(logged).not.toHaveBeenCalled();
    });

    it('hands `fields` back as stored, without walking it', () => {
        const fields = { nested: { deep: [1, 2, 3] } };
        const parsed = parseMethodOutput(method, resource({ fields })) as {
            fields: unknown;
        };
        expect(parsed.fields).toBe(fields);
    });

    it('falls back on a recoverable key and logs one warning naming the method, id and paths', () => {
        const parsed = parseMethodOutput(
            method,
            resource({ image: 42, meta: { width: 'wide' } })
        );

        expect(parsed).toMatchObject({ image: null, meta: { width: undefined } });
        const lines = logLines();
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('The result of things.get');
        expect(lines[0]).toContain('(id 8f2c, locale en)');
        expect(lines[0]).toContain('image, meta.width');
    });

    it('walks past a null and an absent value to the key that fell back', () => {
        parseMethodOutput(method, resource({ image: 1, meta: null }));
        parseMethodOutput(method, resource({ meta: { width: 'wide' } }));
        parseMethodOutput(method, resource({ meta: {}, image: 2 }));

        expect(logLines().map((line) => line.split(': ').at(-1))).toEqual([
            'image',
            'meta.width',
            'image',
        ]);
    });

    it('finds the path through whichever side of a union the result took', () => {
        const oneOrMany = {
            name: 'things.update',
            output: z.union([thing, z.array(thing)]),
        };
        parseMethodOutput(oneOrMany, resource({ image: 3 }));
        parseMethodOutput(oneOrMany, [resource(), resource({ id: '9a1b', image: 4 })]);

        expect(logLines()[0]).toContain('(id 8f2c, locale en): image');
        expect(logLines()[1]).toContain(': 1.image (id 9a1b)');
    });

    it('names a list item by its id', () => {
        const list = { name: 'things.query', output: z.object({ data: z.array(thing) }) };
        parseMethodOutput(list, {
            data: [resource(), resource({ id: '9a1b', image: 7 })],
        });

        expect(logLines()[0]).toContain('data.1.image (id 9a1b)');
    });

    it('throws OutputValidationError naming the method, id, locale and path of a required key', () => {
        const run = (): unknown => parseMethodOutput(method, resource({ role: null }));

        expect(run).toThrow(OutputValidationError);
        expect(run).toThrow(
            /^The result of things\.get doesn't match its output schema \(id 8f2c, locale en\):\n✖ .*expected string, received null\n {2}→ at role$/
        );
    });

    it('fails on a missing key with a fallback, which is a code bug rather than stored drift', () => {
        const { image: _image, ...missing } = resource();
        expect(() => parseMethodOutput(method, missing)).toThrow(OutputValidationError);
        expect(() => parseMethodOutput(method, missing)).toThrow(/→ at image/);
        expect(logged).not.toHaveBeenCalled();
    });

    it('leaves out a missing key whose schema is optional, without a fallback', () => {
        const result = parseMethodOutput(method, resource({ meta: {} }));
        expect(result).toMatchObject({ meta: {} });
        expect(logged).not.toHaveBeenCalled();
    });

    it('names no resource when the result is not one', () => {
        const count = { name: 'things.count', output: z.number() };

        expect(() => parseMethodOutput(count, 'many')).toThrow(
            /^The result of things\.count doesn't match its output schema:\n/
        );
    });

    it('refuses a `fields` that is not an object', () => {
        expect(() => parseMethodOutput(method, resource({ fields: [] }))).toThrow(
            /Expected a JSON object\n {2}→ at fields/
        );
    });

    it('answers the result unparsed for a method with no output', () => {
        const result = resource();
        expect(parseMethodOutput({ name: 'plugins.x.run' }, result)).toBe(result);
    });

    it('counts nothing for a fallback taken outside a parse', () => {
        expect(thing.parse(resource({ image: 1 }))).toMatchObject({ image: null });
        parseMethodOutput(method, resource());

        expect(logged).not.toHaveBeenCalled();
    });
});
