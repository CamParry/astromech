/**
 * Unit tests for `ctx.coerceOnly` — the patch-scoped coercion switch.
 *
 * The probe field type below has a deliberately non-idempotent coercer, so a
 * second pass over an untouched value is directly observable.
 */

import type { Field, ValidationMode } from '@/types/fields';
import { describe, expect, it } from 'vitest';
import { registerFieldType } from '@/fields/field-type-registry';
import { parseFields } from '@/fields/parse-fields';

type CtxOverrides = Partial<{
    operation: 'create' | 'update';
    validation: ValidationMode;
    coerceOnly: ReadonlySet<string>;
}>;

function fakeCtx(overrides: CtxOverrides = {}) {
    return {
        operation: 'update' as const,
        resource: { kind: 'entry' as const, record: {} },
        user: null,
        lookups: { isUnique: async () => true },
        ...overrides,
    };
}

function field(def: Partial<Field> & { name: string; type: string }): Field {
    return def as Field;
}

// Appends a marker on every pass, so `f(f(x)) !== f(x)`.
registerFieldType({
    type: 'stamped',
    build: (() => ({})) as never,
    component: '',
    tsType: () => 'string',
    coerce: (v) => (typeof v === 'string' ? `${v}!` : v),
    validate: async () => true,
});

describe('coerceOnly — root fields', () => {
    const defs = [
        field({ name: 'a', type: 'stamped' }),
        field({ name: 'b', type: 'stamped' }),
    ];

    it('coerces everything when absent', async () => {
        const { values } = await parseFields({ a: 'x', b: 'y' }, defs, fakeCtx());
        expect(values).toEqual({ a: 'x!', b: 'y!' });
    });

    it('coerces only the named fields', async () => {
        const { values } = await parseFields(
            { a: 'x', b: 'y' },
            defs,
            fakeCtx({ coerceOnly: new Set(['a']) })
        );
        expect(values).toEqual({ a: 'x!', b: 'y' });
    });

    it('an empty set coerces nothing', async () => {
        const { values } = await parseFields(
            { a: 'x', b: 'y' },
            defs,
            fakeCtx({ coerceOnly: new Set<string>() })
        );
        expect(values).toEqual({ a: 'x', b: 'y' });
    });
});

describe('coerceOnly — container subtrees', () => {
    const defs = [
        field({
            name: 'sections',
            type: 'repeater',
            fields: [field({ name: 'label', type: 'stamped' })],
        }),
        field({
            name: 'other',
            type: 'repeater',
            fields: [field({ name: 'label', type: 'stamped' })],
        }),
    ];

    it('a patched container coerces its whole subtree', async () => {
        const { values } = await parseFields(
            {
                sections: [{ _id: 'a1', label: 'one' }],
                other: [{ _id: 'b1', label: 'two' }],
            },
            defs,
            fakeCtx({ coerceOnly: new Set(['sections']) })
        );
        expect(values).toEqual({
            sections: [{ _id: 'a1', label: 'one!' }],
            other: [{ _id: 'b1', label: 'two' }],
        });
    });
});

describe('coerceOnly — validation still covers every field', () => {
    it('an uncoerced field is still validated', async () => {
        const { errors } = await parseFields(
            { title: '' },
            [field({ name: 'title', type: 'text', required: true })],
            fakeCtx({ coerceOnly: new Set<string>() })
        );
        expect(errors.title).toEqual(['This field is required']);
    });

    it('an uncoerced container is still normalized by children()', async () => {
        const { values } = await parseFields(
            { sections: [{ label: 'one' }] },
            [
                field({
                    name: 'sections',
                    type: 'repeater',
                    fields: [field({ name: 'label', type: 'text' })],
                }),
            ],
            fakeCtx({ coerceOnly: new Set<string>() })
        );
        const items = values.sections as Record<string, unknown>[];
        expect(typeof items[0]?._id).toBe('string');
        expect(items[0]?._id).not.toBe('');
    });
});
