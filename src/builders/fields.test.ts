import { describe, expect, it } from 'vitest';
import type { EntryTypeConfig } from '@/types/index.js';
import type { FieldDefinition } from '@/types/fields.js';
import {
    accordion,
    block,
    blocks,
    boolean,
    group,
    number,
    relationship,
    section,
    select,
    t,
    tab,
    tabs,
    text,
    textarea,
} from './fields.js';

// Compile-proof: factory output assignable to EntryTypeConfig['fields'].
const _flat: EntryTypeConfig['fields'] = [
    text('from', { required: true, searchable: true }),
    select('status', { options: ['301', '302'], defaultValue: '301' }),
    boolean('enabled', { defaultValue: true }),
];
void _flat;

const _twoColumn: EntryTypeConfig['fields'] = {
    main: [text('title')],
    sidebar: [boolean('featured')],
};
void _twoColumn;

describe('field factories — leaves', () => {
    it('text(name, options) returns a plain object', () => {
        expect(text('from', { required: true })).toEqual({
            name: 'from',
            type: 'text',
            required: true,
        });
    });

    it('emits a clean POJO (no prototype methods)', () => {
        const parsed = JSON.parse(JSON.stringify(text('x', { label: 'X' }))) as unknown;
        expect(parsed).toEqual({ name: 'x', type: 'text', label: 'X' });
    });

    it('select carries options + defaultValue from the settings object', () => {
        expect(
            select('status', { options: ['301', '302'], defaultValue: '301' })
        ).toEqual({
            name: 'status',
            type: 'select',
            options: ['301', '302'],
            defaultValue: '301',
        });
    });

    it('number carries min/max/step', () => {
        expect(number('n', { min: 0, max: 10, step: 2 })).toEqual({
            name: 'n',
            type: 'number',
            min: 0,
            max: 10,
            step: 2,
        });
    });

    it('boolean carries defaultValue', () => {
        expect(boolean('b', { defaultValue: true })).toEqual({
            name: 'b',
            type: 'boolean',
            defaultValue: true,
        });
    });

    it('relationship carries target + multiple', () => {
        expect(relationship('author', { target: 'users', multiple: true })).toEqual({
            name: 'author',
            type: 'relationship',
            target: 'users',
            multiple: true,
        });
    });
});

describe('field factories — data containers (name-first, nested)', () => {
    it('group(name, { fields })', () => {
        const result = group('address', { fields: [text('street'), text('city')] });
        expect(result).toEqual({
            name: 'address',
            type: 'group',
            fields: [
                { name: 'street', type: 'text' },
                { name: 'city', type: 'text' },
            ],
        });
    });

    it('group(name, { label, fields })', () => {
        const result = group('address', { label: 'Address', fields: [text('street')] });
        expect(result).toMatchObject({
            name: 'address',
            type: 'group',
            label: 'Address',
            fields: [{ name: 'street', type: 'text' }],
        });
    });

    it('block(type, { fields }) — label omitted, derived by the renderer', () => {
        const result = block('hero', { fields: [text('heading')] });
        expect(result).toEqual({
            type: 'hero',
            fields: [{ name: 'heading', type: 'text' }],
        });
    });

    it('blocks(name, { blocks: [block(...)] })', () => {
        const result = blocks('content', {
            blocks: [
                block('hero', {
                    label: 'Hero',
                    icon: 'image',
                    fields: [text('heading')],
                }),
                block('quote', { fields: [textarea('text')] }),
            ],
        });
        expect(result).toMatchObject({ name: 'content', type: 'blocks' });
        expect(result.blocks).toHaveLength(2);
        expect(result.blocks?.[0]).toEqual({
            type: 'hero',
            label: 'Hero',
            icon: 'image',
            fields: [{ name: 'heading', type: 'text' }],
        });
    });
});

describe('field factories — layout containers (name-first, flat, chrome)', () => {
    it('section(name, { fields }) — label omitted, derived by the renderer', () => {
        const result = section('content', { fields: [richtextStub()] });
        expect(result).toMatchObject({ name: 'content', type: 'section' });
        expect(result.label).toBeUndefined();
        expect(result.fields).toHaveLength(1);
    });

    it('section(name, { label, fields }) — explicit label kept', () => {
        const result = section('content', {
            label: 'Page Content',
            fields: [richtextStub()],
        });
        expect(result).toMatchObject({
            name: 'content',
            type: 'section',
            label: 'Page Content',
        });
    });

    it('accordion(name, { collapsed, fields })', () => {
        const result = accordion('advanced', {
            collapsed: true,
            fields: [number('cache_ttl')],
        });
        expect(result).toMatchObject({
            name: 'advanced',
            type: 'accordion',
            collapsed: true,
        });
        expect(result.label).toBeUndefined();
    });

    it('tabs({ fields: [tab(...)] })', () => {
        const result = tabs({
            fields: [
                tab('content', { label: 'Content', fields: [text('title')] }),
                tab('seo', { fields: [text('meta')] }),
            ],
        });
        expect(result.type).toBe('tabs');
        expect(result.fields).toHaveLength(2);
        expect(result.fields?.[0]).toMatchObject({
            name: 'content',
            type: 'tab',
            label: 'Content',
        });
    });
});

describe('t() label descriptor', () => {
    it('captures a key as a serializable descriptor', () => {
        expect(t('seo.section')).toEqual({ $t: 'seo.section' });
    });

    it('a chrome container carries a `t()` label descriptor in options', () => {
        const node = section('seo', {
            label: t('seo.section'),
            fields: [text('metaTitle')],
        });
        expect(node.name).toBe('seo');
        expect(node.label).toEqual({ $t: 'seo.section' });
    });
});

describe('type assignability', () => {
    it('factory output is FieldDefinition', () => {
        const f: FieldDefinition = text('x');
        const arr: FieldDefinition[] = [text('a'), select('s', { options: ['x'] })];
        expect(f.name).toBe('x');
        expect(arr).toHaveLength(2);
    });
});

function richtextStub(): FieldDefinition {
    return text('body');
}
