import { describe, expect, it } from 'vitest';
import { CORE_FIELD_TYPES } from '@/types/fields.js';
import { getFieldTypeDescriptor } from '@/fields/descriptors.js';

const LAYOUT_TYPES = new Set(['section', 'tabs', 'tab', 'accordion']);

const DATA_TYPES = CORE_FIELD_TYPES.filter((t) => !LAYOUT_TYPES.has(t));

describe('core field-type descriptors', () => {
    it('every data type has a registered descriptor', () => {
        for (const type of DATA_TYPES) {
            expect(getFieldTypeDescriptor(type), `missing descriptor for "${type}"`).toBeDefined();
        }
    });

    it('layout types have no descriptor', () => {
        for (const type of LAYOUT_TYPES) {
            expect(getFieldTypeDescriptor(type), `unexpected descriptor for layout "${type}"`).toBeUndefined();
        }
    });

    describe('tsType spot-checks', () => {
        it('text → "string" for both shapes', () => {
            const d = getFieldTypeDescriptor('text');
            const field = { name: 'x', type: 'text' } as const;
            expect(d?.tsType(field, 'full')).toBe('string');
            expect(d?.tsType(field, 'public')).toBe('string');
        });

        it('richtext → JsonValue import for full, "string" for public', () => {
            const d = getFieldTypeDescriptor('richtext');
            const field = { name: 'body', type: 'richtext' } as const;
            expect(d?.tsType(field, 'full')).toBe("import('astromech').JsonValue");
            expect(d?.tsType(field, 'public')).toBe('string');
        });

        it('media with multiple:true → "string[]"', () => {
            const d = getFieldTypeDescriptor('media');
            expect(d?.tsType({ name: 'imgs', type: 'media', multiple: true }, 'full')).toBe('string[]');
        });

        it('media without multiple → "string"', () => {
            const d = getFieldTypeDescriptor('media');
            expect(d?.tsType({ name: 'img', type: 'media' }, 'full')).toBe('string');
        });

        it('multiselect → "string[]"', () => {
            const d = getFieldTypeDescriptor('multiselect');
            expect(d?.tsType({ name: 'tags', type: 'multiselect' }, 'full')).toBe('string[]');
        });
    });

    describe('defaultValue', () => {
        it('boolean defaultValue === false', () => {
            const d = getFieldTypeDescriptor('boolean');
            expect(d?.defaultValue).toBe(false);
        });

        it('multiselect defaultValue deep-equals []', () => {
            const d = getFieldTypeDescriptor('multiselect');
            expect(d?.defaultValue).toEqual([]);
        });

        it('checkbox-group defaultValue deep-equals []', () => {
            const d = getFieldTypeDescriptor('checkbox-group');
            expect(d?.defaultValue).toEqual([]);
        });

        it('repeater defaultValue deep-equals []', () => {
            const d = getFieldTypeDescriptor('repeater');
            expect(d?.defaultValue).toEqual([]);
        });

        it('blocks defaultValue deep-equals []', () => {
            const d = getFieldTypeDescriptor('blocks');
            expect(d?.defaultValue).toEqual([]);
        });

        it('tree defaultValue deep-equals []', () => {
            const d = getFieldTypeDescriptor('tree');
            expect(d?.defaultValue).toEqual([]);
        });

        it('text has no defaultValue key', () => {
            const d = getFieldTypeDescriptor('text');
            expect(d).not.toHaveProperty('defaultValue');
        });
    });

    describe('reservedKeys', () => {
        it('repeater reservedKeys deep-equals ["_id","_disabled","_title"]', () => {
            const d = getFieldTypeDescriptor('repeater');
            expect(d?.reservedKeys).toEqual(['_id', '_disabled', '_title']);
        });

        it('tree reservedKeys deep-equals ["_id","_disabled"]', () => {
            const d = getFieldTypeDescriptor('tree');
            expect(d?.reservedKeys).toEqual(['_id', '_disabled']);
        });

        it('blocks reservedKeys deep-equals ["_id","_type","_disabled","_title"]', () => {
            const d = getFieldTypeDescriptor('blocks');
            expect(d?.reservedKeys).toEqual(['_id', '_type', '_disabled', '_title']);
        });

        it('text has no reservedKeys', () => {
            const d = getFieldTypeDescriptor('text');
            expect(d?.reservedKeys).toBeUndefined();
        });
    });

    describe('isContainer / isRelation flags', () => {
        it('repeater isContainer === true', () => {
            const d = getFieldTypeDescriptor('repeater');
            expect(d?.isContainer).toBe(true);
        });

        it('group isContainer === true', () => {
            const d = getFieldTypeDescriptor('group');
            expect(d?.isContainer).toBe(true);
        });

        it('blocks isContainer === true', () => {
            const d = getFieldTypeDescriptor('blocks');
            expect(d?.isContainer).toBe(true);
        });

        it('tree isContainer === true', () => {
            const d = getFieldTypeDescriptor('tree');
            expect(d?.isContainer).toBe(true);
        });

        it('text has no isContainer', () => {
            const d = getFieldTypeDescriptor('text');
            expect(d?.isContainer).toBeUndefined();
        });

        it('media isRelation === true', () => {
            const d = getFieldTypeDescriptor('media');
            expect(d?.isRelation).toBe(true);
        });

        it('relationship isRelation === true', () => {
            const d = getFieldTypeDescriptor('relationship');
            expect(d?.isRelation).toBe(true);
        });

        it('text has no isRelation', () => {
            const d = getFieldTypeDescriptor('text');
            expect(d?.isRelation).toBeUndefined();
        });
    });
});
