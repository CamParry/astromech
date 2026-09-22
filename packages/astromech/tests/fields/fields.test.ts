import type { Field } from '@/types/fields';
import type { EntryType } from '@/types/index';
import { describe, expect, it } from 'vitest';
import {
    accordion,
    block,
    blocks,
    boolean,
    group,
    number,
    relationship,
    select,
    t,
    tab,
    tabs,
    text,
    textarea,
} from '@/fields/builder';

// Compile-proof: factory output assignable to EntryType['fields'].
const _flat: EntryType['fields'] = [
    text('from', { required: true, searchable: true }),
    select('status', { options: ['301', '302'], defaultValue: '301' }),
    boolean('enabled', { defaultValue: true }),
];
void _flat;

const _twoColumn: EntryType['fields'] = {
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

describe('field factories — nested fields (name-first, own data key)', () => {
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
            fields: [{ name: 'heading', type: 'text' }],
        });
    });
});

describe('field factories — structural fields (a name is always a data key)', () => {
    it('group({ label, description, fields }) is an unnamed layout field', () => {
        const result = group({
            label: 'Page Content',
            description: 'Shown on the page',
            fields: [richtextStub()],
        });
        expect(result).toEqual({
            type: 'group',
            label: 'Page Content',
            description: 'Shown on the page',
            fields: [richtextStub()],
        });
        expect(result.name).toBeUndefined();
    });

    it('group(name, { boxed: false, fields }) keeps the name as a data key', () => {
        const result = group('seo', { boxed: false, fields: [text('title')] });
        expect(result).toEqual({
            name: 'seo',
            type: 'group',
            boxed: false,
            fields: [{ name: 'title', type: 'text' }],
        });
    });

    it('accordion({ label, collapsed, fields }) stores nothing itself', () => {
        const result = accordion({
            label: 'Advanced',
            collapsed: true,
            fields: [number('cache_ttl')],
        });
        expect(result).toEqual({
            type: 'accordion',
            label: 'Advanced',
            collapsed: true,
            fields: [{ name: 'cache_ttl', type: 'number' }],
        });
    });

    it('accordion(name, …) wraps an unboxed group carrying the name', () => {
        const result = accordion('advanced', {
            collapsed: true,
            fields: [number('cache_ttl')],
        });
        expect(result).toEqual({
            type: 'accordion',
            label: 'Advanced',
            collapsed: true,
            fields: [
                {
                    name: 'advanced',
                    type: 'group',
                    boxed: false,
                    fields: [{ name: 'cache_ttl', type: 'number' }],
                },
            ],
        });
    });

    it('tab(name, { label, fields }) wraps an unboxed group carrying the name', () => {
        const result = tab('seo', {
            label: 'SEO',
            description: 'Search listing',
            private: true,
            fields: [text('title')],
        });
        expect(result).toEqual({
            type: 'tab',
            label: 'SEO',
            description: 'Search listing',
            private: true,
            fields: [
                {
                    name: 'seo',
                    type: 'group',
                    boxed: false,
                    label: 'SEO',
                    fields: [{ name: 'title', type: 'text' }],
                },
            ],
        });
    });

    it('tabs({ fields: [tab(...)] }) has no name', () => {
        const result = tabs({
            fields: [
                tab({ label: 'Content', fields: [text('title')] }),
                tab({ label: 'Meta', fields: [text('meta')] }),
            ],
        });
        expect(result.name).toBeUndefined();
        expect(result.type).toBe('tabs');
        expect(result.fields).toHaveLength(2);
        expect(result.fields[0]).toEqual({
            type: 'tab',
            label: 'Content',
            fields: [{ name: 'title', type: 'text' }],
        });
    });

    it('tabs() forwards `private` like its layout siblings', () => {
        const result = tabs({ private: true, fields: [] });
        expect(result).toEqual({ type: 'tabs', private: true, fields: [] });
    });
});

describe('t() label descriptor', () => {
    it('captures a key as a serializable descriptor', () => {
        expect(t('seo.section')).toEqual({ $t: 'seo.section' });
    });

    it('a layout field carries a `t()` label descriptor in options', () => {
        const node = group({
            label: t('seo.section'),
            fields: [text('metaTitle')],
        });
        expect(node.label).toEqual({ $t: 'seo.section' });
    });
});

describe('type assignability', () => {
    it('factory output is Field', () => {
        const f: Field = text('x');
        const arr: Field[] = [text('a'), select('s', { options: ['x'] })];
        expect(f.name).toBe('x');
        expect(arr).toHaveLength(2);
    });
});

function richtextStub(): Field {
    return text('body');
}
