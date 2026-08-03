/**
 * A link value is keyed by `url`, and every side of the contract must say so.
 *
 * The admin's `LinkField` used to write `href`, so the descriptor's generated
 * type and the validator described a shape the editor could never produce and
 * every save failed on "A link needs a url". These assertions pin the key on
 * the two halves that can be checked without rendering; the editor half is
 * pinned by tests/admin/components/fields/link-field-value.test.tsx.
 */

import { describe, expect, it } from 'vitest';
import type { FieldValidationContext } from '@/types/fields.js';
import { getFieldTypeDescriptor } from '@/fields/descriptors.js';
import { validateLink } from '@/fields/built-in-rules.js';

function ctx(value: unknown): FieldValidationContext {
    return {
        value,
        values: {},
        field: { name: 'cta', type: 'link' },
        path: [{ kind: 'field', name: 'cta' }],
        operation: 'create',
        stage: 'publish',
        host: { kind: 'entry', record: null },
        user: null,
        reads: { isUnique: async () => true },
    };
}

describe('link value shape', () => {
    const field = { name: 'cta', type: 'link' } as const;

    it('the generated type names `url` and never `href`', () => {
        const d = getFieldTypeDescriptor('link');
        for (const shape of ['full', 'public'] as const) {
            const tsType = d?.tsType(field, shape);
            expect(tsType).toContain('url:');
            expect(tsType).not.toContain('href');
        }
    });

    it('the validator accepts the shape the generated type describes', async () => {
        expect(
            await validateLink(
                ctx({ url: 'https://example.com', label: 'Docs', target: '_blank' })
            )
        ).toBe(true);
    });

    it('the validator rejects an `href`-keyed link', async () => {
        expect(
            await validateLink(ctx({ href: 'https://example.com', label: 'Docs' }))
        ).toBe('A link needs a url');
    });
});
