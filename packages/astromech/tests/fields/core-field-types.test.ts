import { describe, expect, it } from 'vitest';
import { CORE_FIELD_TYPES } from '@/types/fields';
import type { Field } from '@/types/fields';
import { getFieldType } from '@/fields/field-type-registry';

const LAYOUT_TYPES = new Set(['section', 'tabs', 'tab', 'accordion']);

const DATA_TYPES = CORE_FIELD_TYPES.filter((t) => !LAYOUT_TYPES.has(t));

describe('core field types', () => {
    it('every data type is registered', () => {
        for (const type of DATA_TYPES) {
            expect(getFieldType(type), `missing field type for "${type}"`).toBeDefined();
        }
    });

    it('layout types are not registered', () => {
        for (const type of LAYOUT_TYPES) {
            expect(
                getFieldType(type),
                `unexpected field type for layout "${type}"`
            ).toBeUndefined();
        }
    });

    describe('tsType spot-checks', () => {
        it('text → "string" for both shapes', () => {
            const d = getFieldType('text');
            const field = { name: 'x', type: 'text' } as const;
            expect(d?.tsType(field, 'full')).toBe('string');
            expect(d?.tsType(field, 'public')).toBe('string');
        });

        it('richtext → JsonValue import for full, "string" for public', () => {
            const d = getFieldType('richtext');
            const field = { name: 'body', type: 'richtext' } as const;
            expect(d?.tsType(field, 'full')).toBe("import('astromech').JsonValue");
            expect(d?.tsType(field, 'public')).toBe('string');
        });

        it('media with multiple:true → "string[]"', () => {
            const d = getFieldType('media');
            expect(
                d?.tsType({ name: 'imgs', type: 'media', multiple: true }, 'full')
            ).toBe('string[]');
        });

        it('media without multiple → "string"', () => {
            const d = getFieldType('media');
            expect(d?.tsType({ name: 'img', type: 'media' }, 'full')).toBe('string');
        });

        it('multiselect → "string[]"', () => {
            const d = getFieldType('multiselect');
            expect(d?.tsType({ name: 'tags', type: 'multiselect' }, 'full')).toBe(
                'string[]'
            );
        });
    });

    describe('defaultValue', () => {
        it('boolean defaultValue === false', () => {
            const d = getFieldType('boolean');
            expect(d?.defaultValue).toBe(false);
        });

        it('multiselect defaultValue deep-equals []', () => {
            const d = getFieldType('multiselect');
            expect(d?.defaultValue).toEqual([]);
        });

        it('checkbox-group defaultValue deep-equals []', () => {
            const d = getFieldType('checkbox-group');
            expect(d?.defaultValue).toEqual([]);
        });

        it('repeater defaultValue deep-equals []', () => {
            const d = getFieldType('repeater');
            expect(d?.defaultValue).toEqual([]);
        });

        it('blocks defaultValue deep-equals []', () => {
            const d = getFieldType('blocks');
            expect(d?.defaultValue).toEqual([]);
        });

        it('tree defaultValue deep-equals []', () => {
            const d = getFieldType('tree');
            expect(d?.defaultValue).toEqual([]);
        });

        it('text has no defaultValue key', () => {
            const d = getFieldType('text');
            expect(d).not.toHaveProperty('defaultValue');
        });
    });

    describe('reservedKeys', () => {
        it('repeater reservedKeys deep-equals ["_id","_disabled","_title"]', () => {
            const d = getFieldType('repeater');
            expect(d?.reservedKeys).toEqual(['_id', '_disabled', '_title']);
        });

        it('tree reservedKeys deep-equals ["_id","_disabled"]', () => {
            const d = getFieldType('tree');
            expect(d?.reservedKeys).toEqual(['_id', '_disabled']);
        });

        it('blocks reservedKeys deep-equals ["_id","_type","_disabled","_title"]', () => {
            const d = getFieldType('blocks');
            expect(d?.reservedKeys).toEqual(['_id', '_type', '_disabled', '_title']);
        });

        it('text has no reservedKeys', () => {
            const d = getFieldType('text');
            expect(d?.reservedKeys).toBeUndefined();
        });
    });

    describe('isRelation flag', () => {
        it('media isRelation === true', () => {
            const d = getFieldType('media');
            expect(d?.isRelation).toBe(true);
        });

        it('relationship isRelation === true', () => {
            const d = getFieldType('relationship');
            expect(d?.isRelation).toBe(true);
        });

        it('text has no isRelation', () => {
            const d = getFieldType('text');
            expect(d?.isRelation).toBeUndefined();
        });
    });

    describe('children', () => {
        it('every nested field type exposes children', () => {
            for (const type of ['group', 'repeater', 'blocks', 'tree']) {
                expect(
                    getFieldType(type)?.children,
                    `missing children for "${type}"`
                ).toBeTypeOf('function');
            }
        });

        it('leaf types expose no children', () => {
            for (const type of ['text', 'json', 'multiselect', 'key-value']) {
                expect(
                    getFieldType(type)?.children,
                    `unexpected children for "${type}"`
                ).toBeUndefined();
            }
        });

        it('group: one scope holding a live reference into next', () => {
            const d = getFieldType('group');
            const field: Field = {
                name: 'seo',
                type: 'group',
                fields: [{ name: 'title', type: 'text' }],
            };
            const { next, scopes } = d?.children?.(field, { title: 'a' }) ?? {
                next: undefined,
                scopes: [],
            };
            expect(scopes).toHaveLength(1);
            expect(scopes[0]?.segments).toEqual([{ kind: 'field', name: 'seo' }]);
            expect(scopes[0]?.definitions).toEqual(field.fields);
            // Live reference: mutating the scope mutates `next`.
            (scopes[0]?.values ?? {}).title = 'b';
            expect((next as { title: string }).title).toBe('b');
        });

        it('repeater: one scope per item, keyed by minted _id', () => {
            const d = getFieldType('repeater');
            const field: Field = {
                name: 'sections',
                type: 'repeater',
                fields: [{ name: 'title', type: 'text' }],
            };
            const input = [{ _id: 'a1' }, {}];
            const { next, scopes } = d?.children?.(field, input) ?? {
                next: undefined,
                scopes: [],
            };
            const out = next as { _id: string }[];
            expect(scopes).toHaveLength(2);
            expect(scopes[0]?.segments).toEqual([
                { kind: 'field', name: 'sections' },
                { kind: 'item', id: 'a1' },
            ]);
            expect(out[1]?._id).toBeTypeOf('string');
            expect(scopes[1]?.segments[1]).toEqual({
                kind: 'item',
                id: out[1]?._id,
            });
            // Input untouched.
            expect(input[1]).toEqual({});
        });

        it('blocks: an undeclared _type yields an item but no scope', () => {
            const d = getFieldType('blocks');
            const field: Field = {
                name: 'content',
                type: 'blocks',
                blocks: [{ type: 'hero', fields: [{ name: 'heading', type: 'text' }] }],
            };
            const { next, scopes } = d?.children?.(field, [
                { _id: 'h1', _type: 'hero' },
                { _id: 'x1', _type: 'mystery' },
            ]) ?? { next: undefined, scopes: [] };
            expect((next as unknown[]).length).toBe(2);
            expect(scopes).toHaveLength(1);
            expect(scopes[0]?.segments[1]).toEqual({ kind: 'item', id: 'h1' });
            expect(scopes[0]?.definitions).toEqual([{ name: 'heading', type: 'text' }]);
        });

        it('tree: nodes at every depth get a flat scope, _children never a segment', () => {
            const d = getFieldType('tree');
            const field: Field = {
                name: 'nav',
                type: 'tree',
                fields: [{ name: 'label', type: 'text' }],
            };
            const { scopes } = d?.children?.(field, [
                { _id: 'n1', _children: [{ _id: 'n2' }] },
            ]) ?? { next: undefined, scopes: [] };
            expect(scopes.map((s) => s.segments)).toEqual([
                [
                    { kind: 'field', name: 'nav' },
                    { kind: 'item', id: 'n2' },
                ],
                [
                    { kind: 'field', name: 'nav' },
                    { kind: 'item', id: 'n1' },
                ],
            ]);
        });

        it('non-array / non-object values fall back to the empty default', () => {
            expect(
                getFieldType('repeater')?.children?.(
                    { name: 'x', type: 'repeater' },
                    'nope'
                )
            ).toEqual({ next: [], scopes: [] });
            expect(
                getFieldType('tree')?.children?.({ name: 'x', type: 'tree' }, undefined)
            ).toEqual({ next: [], scopes: [] });
            expect(
                getFieldType('group')?.children?.({ name: 'x', type: 'group' }, 42)?.next
            ).toEqual({});
        });
    });
});

// ---------------------------------------------------------------------------
// Validator coverage
// ---------------------------------------------------------------------------

// `validate` is required on `FieldType`, so this only bites one registered
// through a cast. It is the property that lets the declarative rules assume a
// well-typed value.
describe('validator coverage', () => {
    it('every data type brings its own validator', () => {
        for (const type of DATA_TYPES) {
            const fieldType = getFieldType(type);
            expect(fieldType?.validate, `${type} has no validator`).toBeTypeOf(
                'function'
            );
        }
    });
});
