/**
 * The resource validator — cross-field rules no single field owns.
 *
 * It runs last, over the coerced values, whether or not the fields reported.
 * A string is a form-level message; an object maps field paths to messages, and
 * a field's own error keeps a key they share.
 */

import type { ResourceType } from '@/types/domain';
import type { Field, ResourceValidator, ValidationMode } from '@/types/fields';
import { describe, expect, it, vi } from 'vitest';
import { parseFields } from '@/fields/parse-fields';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CtxOverrides = Partial<{
    operation: 'create' | 'update';
    validation: ValidationMode;
    resourceValidate: ResourceValidator;
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

const title = field({ name: 'title', type: 'text' });

// ---------------------------------------------------------------------------
// What it reports
// ---------------------------------------------------------------------------

describe('resource validator results', () => {
    it('a string becomes a form-level message and leaves errors empty', async () => {
        const { errors, form } = await parseFields(
            { title: 'hello' },
            [title],
            fakeCtx({
                resourceValidate: async () => 'Pick a publish date or unpublish',
            })
        );
        expect(form).toEqual(['Pick a publish date or unpublish']);
        expect(errors).toEqual({});
    });

    it('an object lands in errors under its keys', async () => {
        const { errors, form } = await parseFields(
            { title: 'hello' },
            [title],
            fakeCtx({
                resourceValidate: async () => ({ title: 'Clashes with the subtitle' }),
            })
        );
        expect(errors.title).toEqual(['Clashes with the subtitle']);
        expect(form).toEqual([]);
    });

    // `ResourceValidationResult` has no `void` member, so a valid resource must
    // return `undefined` explicitly; a body that falls off the end infers
    // `Promise<void>` and does not type-check as a `ResourceValidator`.
    it('an explicit undefined reports nothing', async () => {
        const valid: ResourceValidator = async () => undefined;
        const { errors, form } = await parseFields(
            { title: 'hello' },
            [title],
            fakeCtx({ resourceValidate: valid })
        );
        expect(errors).toEqual({});
        expect(form).toEqual([]);
    });

    it('null reports nothing', async () => {
        const valid: ResourceValidator = async () => null;
        const { errors, form } = await parseFields(
            { title: 'hello' },
            [title],
            fakeCtx({ resourceValidate: valid })
        );
        expect(errors).toEqual({});
        expect(form).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Interaction with field errors
// ---------------------------------------------------------------------------

describe('resource validator and field errors', () => {
    it("a field's own error keeps a key the resource validator also claims", async () => {
        const { errors } = await parseFields(
            { title: 'ab' },
            [field({ name: 'title', type: 'text', validation: [{ minLength: 5 }] })],
            fakeCtx({
                resourceValidate: async () => ({ title: 'Resource-level message' }),
            })
        );
        expect(errors.title).toEqual(['Must be at least 5 characters']);
    });

    it('it still runs when a field failed', async () => {
        const resourceValidate = vi.fn(async () => 'Form-level problem');
        const { errors, form } = await parseFields(
            { title: 'ab' },
            [field({ name: 'title', type: 'text', validation: [{ minLength: 5 }] })],
            fakeCtx({ resourceValidate })
        );
        expect(resourceValidate).toHaveBeenCalledTimes(1);
        expect(errors.title).toEqual(['Must be at least 5 characters']);
        expect(form).toEqual(['Form-level problem']);
    });
});

// ---------------------------------------------------------------------------
// What it receives
// ---------------------------------------------------------------------------

describe('resource validation context', () => {
    it('receives the coerced values', async () => {
        let seen: Record<string, unknown> | undefined;
        const { values } = await parseFields(
            { rank: ' 42 ' },
            [field({ name: 'rank', type: 'number' })],
            fakeCtx({
                resourceValidate: async (ctx) => {
                    seen = ctx.values;
                    return undefined;
                },
            })
        );
        expect(values.rank).toBe(42);
        expect(seen?.rank).toBe(42);
    });

    it('receives a concrete mode when the caller passed one', async () => {
        let seen: ValidationMode | undefined;
        await parseFields(
            { title: 'hello' },
            [title],
            fakeCtx({
                validation: 'partial',
                resourceValidate: async (ctx) => {
                    seen = ctx.validation;
                    return undefined;
                },
            })
        );
        expect(seen).toBe('partial');
    });

    it('receives the complete default when the caller passed none', async () => {
        let seen: ValidationMode | undefined;
        await parseFields(
            { title: 'hello' },
            [title],
            fakeCtx({
                resourceValidate: async (ctx) => {
                    seen = ctx.validation;
                    return undefined;
                },
            })
        );
        expect(seen).toBe('complete');
    });
});
