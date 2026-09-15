/**
 * A link value is keyed by `url` on every side of the contract. These pin the key
 * on the generated type and the validator, the halves checkable without
 * rendering; tests/admin/components/fields/link-field-value.test.tsx pins the editor.
 */

import type { FieldValidationContext } from '@/types/fields';
import { describe, expect, it } from 'vitest';
import { validateLink } from '@/fields/built-in-rules';
import { getFieldType } from '@/fields/field-type-registry';

function ctx(value: unknown): FieldValidationContext {
    return {
        value,
        values: {},
        field: { name: 'cta', type: 'link' },
        path: [{ kind: 'field', name: 'cta' }],
        operation: 'create',
        validation: 'complete',
        resource: { kind: 'entry', record: null },
        user: null,
        lookups: { isUnique: async () => true },
    };
}

describe('link value shape', () => {
    const field = { name: 'cta', type: 'link' } as const;

    it('the generated type names `url` and never `href`', () => {
        const d = getFieldType('link');
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
