/**
 * The document validator — cross-field rules no single field owns.
 *
 * It runs last, over the coerced values, whether or not the fields reported.
 * A string is a form-level message; an object maps field paths to messages, and
 * a field's own error keeps a key they share.
 */

import { describe, expect, it, vi } from 'vitest';
import type {
    FieldDefinition,
    ResourceValidator,
    ValidationStage,
} from '@/types/fields.js';
import type { ResourceType } from '@/types/domain.js';
import { processFields } from '@/fields/pipeline.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CtxOverrides = Partial<{
    operation: 'create' | 'update';
    stage: ValidationStage;
    documentValidate: ResourceValidator;
    host: { kind: ResourceType; record: unknown };
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

const title = field({ name: 'title', type: 'text' });

// ---------------------------------------------------------------------------
// What it reports
// ---------------------------------------------------------------------------

describe('document validator results', () => {
    it('a string becomes a form-level message and leaves errors empty', async () => {
        const { errors, form } = await processFields(
            { title: 'hello' },
            [title],
            fakeCtx({
                documentValidate: async () => 'Pick a publish date or unpublish',
            })
        );
        expect(form).toEqual(['Pick a publish date or unpublish']);
        expect(errors).toEqual({});
    });

    it('an object lands in errors under its keys', async () => {
        const { errors, form } = await processFields(
            { title: 'hello' },
            [title],
            fakeCtx({
                documentValidate: async () => ({ title: 'Clashes with the subtitle' }),
            })
        );
        expect(errors.title).toEqual(['Clashes with the subtitle']);
        expect(form).toEqual([]);
    });

    // `ResourceValidationResult` has no `void` member, so a valid document must
    // return `undefined` explicitly; a body that falls off the end infers
    // `Promise<void>` and does not type-check as a `ResourceValidator`.
    it('an explicit undefined reports nothing', async () => {
        const valid: ResourceValidator = async () => undefined;
        const { errors, form } = await processFields(
            { title: 'hello' },
            [title],
            fakeCtx({ documentValidate: valid })
        );
        expect(errors).toEqual({});
        expect(form).toEqual([]);
    });

    it('null reports nothing', async () => {
        const valid: ResourceValidator = async () => null;
        const { errors, form } = await processFields(
            { title: 'hello' },
            [title],
            fakeCtx({ documentValidate: valid })
        );
        expect(errors).toEqual({});
        expect(form).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Interaction with field errors
// ---------------------------------------------------------------------------

describe('document validator and field errors', () => {
    it("a field's own error keeps a key the document validator also claims", async () => {
        const { errors } = await processFields(
            { title: 'ab' },
            [field({ name: 'title', type: 'text', validation: [{ minLength: 5 }] })],
            fakeCtx({
                documentValidate: async () => ({ title: 'Document-level message' }),
            })
        );
        expect(errors.title).toEqual(['Must be at least 5 characters']);
    });

    it('it still runs when a field failed', async () => {
        const documentValidate = vi.fn(async () => 'Form-level problem');
        const { errors, form } = await processFields(
            { title: 'ab' },
            [field({ name: 'title', type: 'text', validation: [{ minLength: 5 }] })],
            fakeCtx({ documentValidate })
        );
        expect(documentValidate).toHaveBeenCalledTimes(1);
        expect(errors.title).toEqual(['Must be at least 5 characters']);
        expect(form).toEqual(['Form-level problem']);
    });
});

// ---------------------------------------------------------------------------
// What it receives
// ---------------------------------------------------------------------------

describe('document validation context', () => {
    it('receives the coerced values', async () => {
        let seen: Record<string, unknown> | undefined;
        const { values } = await processFields(
            { path: 'Hello World' },
            [field({ name: 'path', type: 'slug' })],
            fakeCtx({
                documentValidate: async (ctx) => {
                    seen = ctx.values;
                    return undefined;
                },
            })
        );
        expect(values.path).toBe('hello-world');
        expect(seen?.path).toBe('hello-world');
    });

    it('receives a concrete stage when the caller passed one', async () => {
        let seen: ValidationStage | undefined;
        await processFields(
            { title: 'hello' },
            [title],
            fakeCtx({
                stage: 'save',
                documentValidate: async (ctx) => {
                    seen = ctx.stage;
                    return undefined;
                },
            })
        );
        expect(seen).toBe('save');
    });

    it('receives the publish default when the caller passed none', async () => {
        let seen: ValidationStage | undefined;
        await processFields(
            { title: 'hello' },
            [title],
            fakeCtx({
                documentValidate: async (ctx) => {
                    seen = ctx.stage;
                    return undefined;
                },
            })
        );
        expect(seen).toBe('publish');
    });
});
