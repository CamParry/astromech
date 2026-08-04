/**
 * Rule severity — `'error'` blocks the write, `'warning'` is advisory.
 *
 * Warnings are only evaluated when `collectWarnings` is set, and only for
 * `field.validation` rules: `required`, container counts and a type's own
 * validator stay error-only and suppress warnings on the same field.
 */

import { describe, expect, it, vi } from 'vitest';
import type { FieldDefinition, ValidationStage } from '@/types/fields.js';
import type { ResourceType } from '@/types/domain.js';
import { processFields } from '@/fields/pipeline.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CtxOverrides = Partial<{
    operation: 'create' | 'update';
    stage: ValidationStage;
    collectWarnings: boolean;
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

// ---------------------------------------------------------------------------
// Where a warning lands
// ---------------------------------------------------------------------------

describe('warning severity', () => {
    const slug = field({
        name: 'slug',
        type: 'text',
        validation: [{ maxLength: 5, severity: 'warning' }],
    });

    it('collectWarnings → the failure lands in warnings, not errors', async () => {
        const { errors, warnings } = await processFields(
            { slug: 'toolongslug' },
            [slug],
            fakeCtx({ collectWarnings: true })
        );
        expect(warnings.slug).toEqual(['Must be at most 5 characters']);
        expect(errors).toEqual({});
    });

    it('collectWarnings omitted → nothing is reported at all', async () => {
        const { errors, warnings } = await processFields(
            { slug: 'toolongslug' },
            [slug],
            fakeCtx()
        );
        expect(errors).toEqual({});
        expect(warnings).toEqual({});
    });

    it('collectWarnings false → the warning rule is never evaluated', async () => {
        const ran = vi.fn(async () => 'Advisory');
        const { warnings } = await processFields(
            { slug: 'anything' },
            [
                field({
                    name: 'slug',
                    type: 'text',
                    validation: [{ custom: ran, severity: 'warning' }],
                }),
            ],
            fakeCtx({ collectWarnings: false })
        );
        expect(ran).not.toHaveBeenCalled();
        expect(warnings).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// One message per severity
// ---------------------------------------------------------------------------

describe('one message per severity', () => {
    it('an error rule and a warning rule both report, one message each', async () => {
        const { errors, warnings } = await processFields(
            { code: 'ab' },
            [
                field({
                    name: 'code',
                    type: 'text',
                    validation: [
                        { minLength: 5 },
                        {
                            pattern: '^[A-Z]+$',
                            message: 'Prefer uppercase',
                            severity: 'warning',
                        },
                    ],
                }),
            ],
            fakeCtx({ collectWarnings: true })
        );
        expect(errors.code).toEqual(['Must be at least 5 characters']);
        expect(warnings.code).toEqual(['Prefer uppercase']);
    });

    it('two failing warning rules → only the first is reported', async () => {
        const second = vi.fn(async () => 'Second');
        const { warnings } = await processFields(
            { code: 'ab' },
            [
                field({
                    name: 'code',
                    type: 'text',
                    validation: [
                        { minLength: 5, severity: 'warning' },
                        { custom: second, severity: 'warning' },
                    ],
                }),
            ],
            fakeCtx({ collectWarnings: true })
        );
        expect(warnings.code).toEqual(['Must be at least 5 characters']);
        expect(second).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Error-only checks suppress warnings on the same field
// ---------------------------------------------------------------------------

describe('error-only checks suppress warnings', () => {
    it('required + empty → the error, and no warning', async () => {
        const advisory = vi.fn(async () => 'Advisory');
        const { errors, warnings } = await processFields(
            { title: '' },
            [
                field({
                    name: 'title',
                    type: 'text',
                    required: true,
                    validation: [{ custom: advisory, severity: 'warning' }],
                }),
            ],
            fakeCtx({ stage: 'publish', collectWarnings: true })
        );
        expect(errors.title).toEqual(['This field is required']);
        expect(warnings).toEqual({});
        expect(advisory).not.toHaveBeenCalled();
    });

    it("the type's own validator suppresses a later author warning", async () => {
        const { errors, warnings } = await processFields(
            { website: 'not-a-url' },
            [
                field({
                    name: 'website',
                    type: 'url',
                    validation: [
                        {
                            pattern: '^https://example\\.com',
                            message: 'Prefer example.com',
                            severity: 'warning',
                        },
                    ],
                }),
            ],
            fakeCtx({ collectWarnings: true })
        );
        expect(errors.website).toEqual(['Must be a valid URL']);
        expect(warnings).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// Path grammar
// ---------------------------------------------------------------------------

describe('nested warnings', () => {
    it('a warning inside a repeater keys by the item path', async () => {
        const { errors, warnings } = await processFields(
            { sections: [{ _id: 'a1', title: 'toolongtitle' }] },
            [
                field({
                    name: 'sections',
                    type: 'repeater',
                    fields: [
                        field({
                            name: 'title',
                            type: 'text',
                            validation: [{ maxLength: 5, severity: 'warning' }],
                        }),
                    ],
                }),
            ],
            fakeCtx({ collectWarnings: true })
        );
        expect(warnings['sections[a1].title']).toEqual(['Must be at most 5 characters']);
        expect(errors).toEqual({});
    });
});
