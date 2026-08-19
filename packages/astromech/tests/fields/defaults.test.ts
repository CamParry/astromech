/**
 * `buildDefaultValues` — the value record a fresh container item starts with.
 *
 * The admin seeds an added block through this, because the pipeline applies
 * defaults on `create` only (`fields/parse-fields.ts`).
 */

import type { Field } from '@/types/fields';
import { describe, expect, it } from 'vitest';
import { buildDefaultValues } from '@/fields/defaults';

function field(def: Partial<Field> & { name: string; type: string }): Field {
    return def as Field;
}

describe('buildDefaultValues', () => {
    it('seeds a declared defaultValue and omits a field without one', () => {
        const values = buildDefaultValues([
            field({ name: 'subject', type: 'text', defaultValue: 'New submission' }),
            field({ name: 'to', type: 'text' }),
        ]);

        expect(values).toEqual({ subject: 'New submission' });
    });

    it("falls back to the field type's own default", () => {
        const values = buildDefaultValues([field({ name: 'enabled', type: 'boolean' })]);

        expect(values).toEqual({ enabled: false });
    });

    it('unwraps layout fields', () => {
        const values = buildDefaultValues([
            field({
                name: 'main',
                type: 'section',
                fields: [field({ name: 'subject', type: 'text', defaultValue: 'Hello' })],
            }),
        ]);

        expect(values).toEqual({ subject: 'Hello' });
    });

    it("nests a group's defaults inside the group", () => {
        const values = buildDefaultValues([
            field({
                name: 'options',
                type: 'group',
                fields: [
                    field({ name: 'reply', type: 'text', defaultValue: 'no-reply' }),
                    field({ name: 'cc', type: 'text' }),
                ],
            }),
        ]);

        expect(values).toEqual({ options: { reply: 'no-reply' } });
    });

    it("keeps a group's own defaultValue over its children's", () => {
        const values = buildDefaultValues([
            field({
                name: 'options',
                type: 'group',
                defaultValue: { reply: 'sales@example.com' },
                fields: [
                    field({ name: 'reply', type: 'text', defaultValue: 'no-reply' }),
                ],
            }),
        ]);

        expect(values).toEqual({ options: { reply: 'sales@example.com' } });
    });

    it('gives each call its own copy of an object default', () => {
        const definitions = [
            field({ name: 'meta', type: 'json', defaultValue: { a: 1 } }),
        ];

        const first = buildDefaultValues(definitions);
        const second = buildDefaultValues(definitions);
        (first['meta'] as Record<string, unknown>)['a'] = 2;

        expect(second['meta']).toEqual({ a: 1 });
    });
});
