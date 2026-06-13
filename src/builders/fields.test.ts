import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '@/types/fields.js';
import { boolean, group, number, relationship, select, text } from './fields.js';

describe('field builders — basic', () => {
    it('text().required() builds to plain object', () => {
        const result = text('from').required().build();
        expect(result).toEqual({ name: 'from', type: 'text', required: true });
    });

    it('JSON.stringify emits a clean plain object (no prototype methods)', () => {
        const parsed = JSON.parse(JSON.stringify(text('x').label('X'))) as unknown;
        expect(parsed).toEqual({ name: 'x', type: 'text', label: 'X' });
        // Verify no function properties leaked through
        const obj = parsed as Record<string, unknown>;
        expect(typeof obj['label']).toBe('string');
        expect(typeof obj['required']).toBe('undefined');
    });

    it('select() with options arg + .default()', () => {
        const result = select('status', ['301', '302']).default('301').build();
        expect(result).toMatchObject({
            name: 'status',
            type: 'select',
            options: ['301', '302'],
            defaultValue: '301',
        });
    });

    it('number().min().max().step()', () => {
        const result = number('n').min(0).max(10).step(2).build();
        expect(result).toEqual({ name: 'n', type: 'number', min: 0, max: 10, step: 2 });
    });

    it('boolean().checkboxLabel()', () => {
        const result = boolean('b').checkboxLabel('on').build();
        expect(result).toEqual({ name: 'b', type: 'boolean', checkboxLabel: 'on' });
    });

    it('relationship().multiple()', () => {
        const result = relationship('author', 'users').multiple().build();
        expect(result).toMatchObject({
            name: 'author',
            type: 'relationship',
            target: 'users',
            multiple: true,
        });
    });
});

describe('field builders — containers', () => {
    it('group().fields() recursively builds nested builders', () => {
        const result = group('g').fields(text('a'), text('b')).build();
        expect(result.fields).toHaveLength(2);
        // Nested should be plain objects, not builders
        const a = result.fields?.[0];
        expect(a).toEqual({ name: 'a', type: 'text' });
        expect(typeof (a as Record<string, unknown>)['required']).toBe('undefined');
        // No builder methods on the output
        expect(typeof (a as Record<string, unknown>)['build']).toBe('undefined');
    });
});

describe('field builders — searchable', () => {
    it('text().searchable() sets searchable:true', () => {
        const result = text('q').searchable().build();
        expect(result).toMatchObject({ name: 'q', type: 'text', searchable: true });
    });
});

describe('field builders — type assignability', () => {
    it('builders build to FieldDefinition', () => {
        // Compile-time assignability checks
        const f: FieldDefinition = text('x').build();
        const arr: FieldDefinition[] = [text('a').build(), select('s', ['x']).build()];

        // Runtime sanity
        expect(f.name).toBe('x');
        expect(arr).toHaveLength(2);
    });
});
