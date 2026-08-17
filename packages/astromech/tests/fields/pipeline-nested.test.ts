/**
 * Nested field validation — the pipeline recursing into nested fields
 * (group / repeater / blocks / tree) and keying errors by the `_id`-based path
 * grammar from `fields/field-path.ts`.
 *
 * Flat-field behaviour lives in `pipeline.test.ts`; this file only covers what
 * happens below a container.
 */

import { describe, expect, it } from 'vitest';
import type { Field, FieldValidationContext, ValidationMode } from '@/types/fields';
import { parseFields } from '@/fields/pipeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeCtx(operation: 'create' | 'update' = 'create', validation?: ValidationMode) {
    return {
        operation,
        // `exactOptionalPropertyTypes`: an omitted validation must be absent, not
        // present-and-undefined.
        ...(validation !== undefined ? { validation } : {}),
        resource: { kind: 'entry' as const, record: {} },
        user: null,
        lookups: { isUnique: async () => true },
    };
}

function field(def: Partial<Field> & { name: string; type: string }): Field {
    return def as Field;
}

/** The single error key produced, for tests that expect exactly one. */
function onlyKey(errors: Record<string, string[]>): string {
    const keys = Object.keys(errors);
    expect(keys).toHaveLength(1);
    return keys[0] as string;
}

type Item = Record<string, unknown>;

function items(values: Record<string, unknown>, name: string): Item[] {
    return values[name] as Item[];
}

// ---------------------------------------------------------------------------
// group
// ---------------------------------------------------------------------------

describe('group', () => {
    const seo = field({
        name: 'seo',
        type: 'group',
        fields: [
            field({ name: 'title', type: 'text', required: true }),
            field({ name: 'description', type: 'text' }),
        ],
    });

    it('required child missing → error keyed "seo.title"', async () => {
        const { errors } = await parseFields({ seo: {} }, [seo], fakeCtx());
        expect(errors['seo.title']).toEqual(['This field is required']);
    });

    it('required child present → no error', async () => {
        const { errors } = await parseFields(
            { seo: { title: 'Hello' } },
            [seo],
            fakeCtx()
        );
        expect(errors).toEqual({});
    });

    it('absent group value → normalized to {} and children still validated', async () => {
        const { values, errors } = await parseFields({}, [seo], fakeCtx());
        expect(errors['seo.title']).toEqual(['This field is required']);
        expect(values.seo).toEqual({});
    });

    it('non-object group value → normalized to {}, does not throw', async () => {
        const { values, errors } = await parseFields(
            { seo: 'not-an-object' },
            [seo],
            fakeCtx()
        );
        expect(errors['seo.title']).toEqual(['This field is required']);
        expect(Array.isArray(values.seo)).toBe(false);
        expect(typeof values.seo).toBe('object');
    });

    it('does not mutate the input value object', async () => {
        const input = { seo: { rank: '  42  ' } };
        const { values } = await parseFields(
            {
                ...input,
            },
            [
                field({
                    name: 'seo',
                    type: 'group',
                    fields: [field({ name: 'rank', type: 'number' })],
                }),
            ],
            fakeCtx()
        );
        // number coerce applies inside the group…
        expect((values.seo as Item).rank).toBe(42);
        // …without touching the caller's object.
        expect(input.seo.rank).toBe('  42  ');
    });

    it('nested group inside a group → dotted path chains', async () => {
        const { errors } = await parseFields(
            {},
            [
                field({
                    name: 'outer',
                    type: 'group',
                    fields: [
                        field({
                            name: 'inner',
                            type: 'group',
                            fields: [
                                field({ name: 'deep', type: 'text', required: true }),
                            ],
                        }),
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors['outer.inner.deep']).toEqual(['This field is required']);
    });

    it('a layout field inside a group stays flat', async () => {
        const { errors } = await parseFields(
            {},
            [
                field({
                    name: 'seo',
                    type: 'group',
                    fields: [
                        field({
                            name: 'panel',
                            type: 'section',
                            fields: [
                                field({ name: 'title', type: 'text', required: true }),
                            ],
                        }),
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors['seo.title']).toEqual(['This field is required']);
    });

    it('group defaults apply to children on create', async () => {
        const { values } = await parseFields(
            { seo: {} },
            [
                field({
                    name: 'seo',
                    type: 'group',
                    fields: [
                        field({ name: 'noindex', type: 'boolean' }),
                        field({ name: 'title', type: 'text', defaultValue: 'Untitled' }),
                    ],
                }),
            ],
            fakeCtx('create')
        );
        expect(values.seo).toEqual({ noindex: false, title: 'Untitled' });
    });
});

// ---------------------------------------------------------------------------
// repeater
// ---------------------------------------------------------------------------

describe('repeater', () => {
    const sections = field({
        name: 'sections',
        type: 'repeater',
        fields: [field({ name: 'title', type: 'text', required: true })],
    });

    it('item error keyed "sections[<id>].title"', async () => {
        const { errors } = await parseFields(
            { sections: [{ _id: 'a1', title: '' }] },
            [sections],
            fakeCtx()
        );
        expect(errors['sections[a1].title']).toEqual(['This field is required']);
    });

    it('only the offending item errors', async () => {
        const { errors } = await parseFields(
            {
                sections: [
                    { _id: 'a1', title: 'ok' },
                    { _id: 'a2', title: '' },
                ],
            },
            [sections],
            fakeCtx()
        );
        expect(Object.keys(errors)).toEqual(['sections[a2].title']);
    });

    it('mints a missing _id and keys the error by it', async () => {
        const { values, errors } = await parseFields(
            { sections: [{ title: '' }] },
            [sections],
            fakeCtx()
        );
        const id = items(values, 'sections')[0]?._id;
        expect(typeof id).toBe('string');
        expect(id).not.toBe('');
        expect(onlyKey(errors)).toBe(`sections[${String(id)}].title`);
    });

    it('mints an _id when the stored one is empty or not a string', async () => {
        const { values } = await parseFields(
            {
                sections: [
                    { _id: '', title: 'a' },
                    { _id: 7, title: 'b' },
                ],
            },
            [sections],
            fakeCtx()
        );
        const [first, second] = items(values, 'sections');
        expect(typeof first?._id).toBe('string');
        expect(first?._id).not.toBe('');
        expect(typeof second?._id).toBe('string');
        expect(second?._id).not.toBe(7);
    });

    it('keeps an existing _id untouched', async () => {
        const { values } = await parseFields(
            { sections: [{ _id: 'keep-me', title: 'a' }] },
            [sections],
            fakeCtx()
        );
        expect(items(values, 'sections')[0]?._id).toBe('keep-me');
    });

    it('does not mutate the input items', async () => {
        const input = [{ title: 'a' }];
        await parseFields({ sections: input }, [sections], fakeCtx());
        expect(input[0]).toEqual({ title: 'a' });
    });

    it('coerce and default apply inside items', async () => {
        const { values } = await parseFields(
            { sections: [{ _id: 'a1', rank: '  42  ' }] },
            [
                field({
                    name: 'sections',
                    type: 'repeater',
                    fields: [
                        field({ name: 'rank', type: 'number' }),
                        field({ name: 'active', type: 'boolean' }),
                    ],
                }),
            ],
            fakeCtx('create')
        );
        expect(items(values, 'sections')[0]).toEqual({
            _id: 'a1',
            rank: 42,
            active: false,
        });
    });

    it('declarative rules run inside items', async () => {
        const { errors } = await parseFields(
            { sections: [{ _id: 'a1', title: 'hi' }] },
            [
                field({
                    name: 'sections',
                    type: 'repeater',
                    fields: [
                        field({
                            name: 'title',
                            type: 'text',
                            validation: [{ minLength: 5 }],
                        }),
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors['sections[a1].title']).toEqual(['Must be at least 5 characters']);
    });

    it('empty container → no child errors even when children are required', async () => {
        const { errors } = await parseFields({ sections: [] }, [sections], fakeCtx());
        expect(errors).toEqual({});
    });

    it('absent container → normalized to [] with no child errors', async () => {
        const { values, errors } = await parseFields({}, [sections], fakeCtx());
        expect(values.sections).toEqual([]);
        expect(errors).toEqual({});
    });

    it('required + empty container → the container itself errors', async () => {
        const { errors } = await parseFields(
            { sections: [] },
            [
                field({
                    name: 'sections',
                    type: 'repeater',
                    required: true,
                    fields: [field({ name: 'title', type: 'text' })],
                }),
            ],
            fakeCtx()
        );
        expect(errors.sections).toEqual(['This field is required']);
    });

    it('non-array value → normalized to [], does not throw', async () => {
        const { values, errors } = await parseFields(
            { sections: 'nope' },
            [sections],
            fakeCtx()
        );
        expect(values.sections).toEqual([]);
        expect(errors).toEqual({});
    });

    it('non-object items pass through untouched and produce no errors', async () => {
        const { values, errors } = await parseFields(
            { sections: ['a string', 3, null] },
            [sections],
            fakeCtx()
        );
        expect(values.sections).toEqual(['a string', 3, null]);
        expect(errors).toEqual({});
    });

    it('_disabled items ARE validated (no special case)', async () => {
        const { errors } = await parseFields(
            { sections: [{ _id: 'a1', _disabled: true, title: '' }] },
            [sections],
            fakeCtx()
        );
        expect(errors['sections[a1].title']).toEqual(['This field is required']);
    });

    it('repeater inside a repeater → "sections[a].items[b].title"', async () => {
        const { errors } = await parseFields(
            {
                sections: [
                    {
                        _id: 'a',
                        items: [{ _id: 'b', title: '' }],
                    },
                ],
            },
            [
                field({
                    name: 'sections',
                    type: 'repeater',
                    fields: [
                        field({
                            name: 'items',
                            type: 'repeater',
                            fields: [
                                field({ name: 'title', type: 'text', required: true }),
                            ],
                        }),
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors['sections[a].items[b].title']).toEqual(['This field is required']);
    });

    it('group inside a repeater → "sections[a].meta.title"', async () => {
        const { errors } = await parseFields(
            { sections: [{ _id: 'a', meta: {} }] },
            [
                field({
                    name: 'sections',
                    type: 'repeater',
                    fields: [
                        field({
                            name: 'meta',
                            type: 'group',
                            fields: [
                                field({ name: 'title', type: 'text', required: true }),
                            ],
                        }),
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors['sections[a].meta.title']).toEqual(['This field is required']);
    });
});

// ---------------------------------------------------------------------------
// blocks
// ---------------------------------------------------------------------------

describe('blocks', () => {
    const content = field({
        name: 'content',
        type: 'blocks',
        blocks: [
            {
                type: 'hero',
                fields: [field({ name: 'heading', type: 'text', required: true })],
            },
            {
                type: 'quote',
                fields: [field({ name: 'cite', type: 'text', required: true })],
            },
        ],
    });

    it('validates each item against ITS block definition', async () => {
        const { errors } = await parseFields(
            {
                content: [
                    { _id: 'h1', _type: 'hero', heading: '' },
                    { _id: 'q1', _type: 'quote', cite: 'ok' },
                ],
            },
            [content],
            fakeCtx()
        );
        expect(errors['content[h1].heading']).toEqual(['This field is required']);
        expect(errors['content[q1].cite']).toBeUndefined();
    });

    it('a field from another block type is not applied', async () => {
        const { errors } = await parseFields(
            { content: [{ _id: 'q1', _type: 'quote', cite: 'ok' }] },
            [content],
            fakeCtx()
        );
        expect(errors['content[q1].heading']).toBeUndefined();
        expect(errors).toEqual({});
    });

    it('unknown _type → error on the container path, no child errors', async () => {
        const { errors } = await parseFields(
            { content: [{ _id: 'x1', _type: 'mystery', heading: '' }] },
            [content],
            fakeCtx()
        );
        expect(errors.content).toEqual(['Unknown block type: mystery']);
        expect(errors['content[x1].heading']).toBeUndefined();
    });

    it('unknown _type items are still normalized into the value', async () => {
        const { values } = await parseFields(
            { content: [{ _type: 'mystery', heading: 'kept' }] },
            [content],
            fakeCtx()
        );
        const item = items(values, 'content')[0];
        expect(typeof item?._id).toBe('string');
        expect(item?.heading).toBe('kept');
    });

    it('several unknown types are listed once each', async () => {
        const { errors } = await parseFields(
            {
                content: [
                    { _id: 'x1', _type: 'mystery' },
                    { _id: 'x2', _type: 'enigma' },
                    { _id: 'x3', _type: 'mystery' },
                ],
            },
            [content],
            fakeCtx()
        );
        expect(errors.content).toEqual(['Unknown block type: mystery, enigma']);
    });

    it('a missing _type counts as unknown', async () => {
        const { errors } = await parseFields(
            { content: [{ _id: 'x1' }] },
            [content],
            fakeCtx()
        );
        expect(errors.content).toEqual(['Unknown block type: undefined']);
    });

    it('mints missing _ids and keys child errors by them', async () => {
        const { values, errors } = await parseFields(
            { content: [{ _type: 'hero', heading: '' }] },
            [content],
            fakeCtx()
        );
        const id = items(values, 'content')[0]?._id;
        expect(typeof id).toBe('string');
        expect(errors[`content[${String(id)}].heading`]).toEqual([
            'This field is required',
        ]);
    });

    it('blocks inside a block → path chains through both items', async () => {
        const { errors } = await parseFields(
            {
                content: [
                    {
                        _id: 'outer',
                        _type: 'columns',
                        inner: [{ _id: 'in1', _type: 'hero', heading: '' }],
                    },
                ],
            },
            [
                field({
                    name: 'content',
                    type: 'blocks',
                    blocks: [
                        {
                            type: 'columns',
                            fields: [
                                field({
                                    name: 'inner',
                                    type: 'blocks',
                                    blocks: [
                                        {
                                            type: 'hero',
                                            fields: [
                                                field({
                                                    name: 'heading',
                                                    type: 'text',
                                                    required: true,
                                                }),
                                            ],
                                        },
                                    ],
                                }),
                            ],
                        },
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors['content[outer].inner[in1].heading']).toEqual([
            'This field is required',
        ]);
    });

    it('empty blocks value → no unknown-type error', async () => {
        const { errors } = await parseFields({ content: [] }, [content], fakeCtx());
        expect(errors).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// tree
// ---------------------------------------------------------------------------

describe('tree', () => {
    const nav = field({
        name: 'nav',
        type: 'tree',
        fields: [field({ name: 'label', type: 'text', required: true })],
    });

    it('root node error keyed "nav[<id>].label"', async () => {
        const { errors } = await parseFields(
            { nav: [{ _id: 'n1', label: '' }] },
            [nav],
            fakeCtx()
        );
        expect(errors['nav[n1].label']).toEqual(['This field is required']);
    });

    it('_children is never a path segment — depth 2 stays flat', async () => {
        const { errors } = await parseFields(
            {
                nav: [
                    {
                        _id: 'n1',
                        label: 'Home',
                        _children: [{ _id: 'n2', label: '' }],
                    },
                ],
            },
            [nav],
            fakeCtx()
        );
        expect(errors['nav[n2].label']).toEqual(['This field is required']);
        expect(Object.keys(errors)).toEqual(['nav[n2].label']);
    });

    it('depth 3 nodes also address as "nav[<id>].label"', async () => {
        const { errors } = await parseFields(
            {
                nav: [
                    {
                        _id: 'n1',
                        label: 'a',
                        _children: [
                            {
                                _id: 'n2',
                                label: 'b',
                                _children: [{ _id: 'n3', label: '' }],
                            },
                        ],
                    },
                ],
            },
            [nav],
            fakeCtx()
        );
        expect(errors['nav[n3].label']).toEqual(['This field is required']);
    });

    it('mints _id at every depth', async () => {
        const { values } = await parseFields(
            { nav: [{ label: 'a', _children: [{ label: 'b' }] }] },
            [nav],
            fakeCtx()
        );
        const root = items(values, 'nav')[0];
        expect(typeof root?._id).toBe('string');
        const child = (root?._children as Item[])[0];
        expect(typeof child?._id).toBe('string');
        expect(child?._id).not.toBe(root?._id);
    });

    it('coerce applies to nested nodes', async () => {
        const { values } = await parseFields(
            {
                nav: [
                    {
                        _id: 'n1',
                        rank: ' 1 ',
                        _children: [{ _id: 'n2', rank: ' 2 ' }],
                    },
                ],
            },
            [
                field({
                    name: 'nav',
                    type: 'tree',
                    fields: [field({ name: 'rank', type: 'number' })],
                }),
            ],
            fakeCtx()
        );
        const root = items(values, 'nav')[0];
        expect(root?.rank).toBe(1);
        expect((root?._children as Item[])[0]?.rank).toBe(2);
    });

    it('does not mutate the input tree', async () => {
        const input = [{ label: 'a', _children: [{ label: 'b' }] }];
        await parseFields({ nav: input }, [nav], fakeCtx());
        expect(input).toEqual([{ label: 'a', _children: [{ label: 'b' }] }]);
    });

    it('non-array _children is left alone', async () => {
        const { values, errors } = await parseFields(
            { nav: [{ _id: 'n1', label: 'a', _children: 'oops' }] },
            [nav],
            fakeCtx()
        );
        expect(items(values, 'nav')[0]?._children).toBe('oops');
        expect(errors).toEqual({});
    });

    it('a very deep tree stops at the depth cap instead of blowing the stack', async () => {
        type Node = { label: string; _children?: Node[] };
        let node: Node = { label: '' };
        for (let i = 0; i < 200; i += 1) {
            node = { label: '', _children: [node] };
        }
        const { errors } = await parseFields({ nav: [node] }, [nav], fakeCtx());
        // Every node has an empty required label, so an uncapped walk would
        // report 201 errors. The cap keeps it far below that.
        const count = Object.keys(errors).length;
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThan(100);
    });
});

// ---------------------------------------------------------------------------
// Container item counts (min / max)
// ---------------------------------------------------------------------------

describe('container item counts', () => {
    const bounded = field({
        name: 'sections',
        type: 'repeater',
        min: 2,
        max: 3,
        fields: [field({ name: 'title', type: 'text' })],
    });

    it('below min → "Must have at least 2 items"', async () => {
        const { errors } = await parseFields(
            { sections: [{ _id: 'a1', title: 'a' }] },
            [bounded],
            fakeCtx()
        );
        expect(errors.sections).toEqual(['Must have at least 2 items']);
    });

    it('above max → "Must have at most 3 items"', async () => {
        const { errors } = await parseFields(
            {
                sections: [{ _id: 'a1' }, { _id: 'a2' }, { _id: 'a3' }, { _id: 'a4' }],
            },
            [bounded],
            fakeCtx()
        );
        expect(errors.sections).toEqual(['Must have at most 3 items']);
    });

    it('within bounds → no error', async () => {
        const { errors } = await parseFields(
            { sections: [{ _id: 'a1' }, { _id: 'a2' }] },
            [bounded],
            fakeCtx()
        );
        expect(errors).toEqual({});
    });

    it('min fires on an empty (optional) container', async () => {
        const { errors } = await parseFields({ sections: [] }, [bounded], fakeCtx());
        expect(errors.sections).toEqual(['Must have at least 2 items']);
    });

    it('required + empty wins over the count message', async () => {
        const { errors } = await parseFields(
            { sections: [] },
            [
                field({
                    name: 'sections',
                    type: 'repeater',
                    required: true,
                    min: 2,
                    fields: [field({ name: 'title', type: 'text' })],
                }),
            ],
            fakeCtx()
        );
        expect(errors.sections).toEqual(['This field is required']);
    });

    it('applies to blocks', async () => {
        const { errors } = await parseFields(
            { content: [{ _id: 'b1', _type: 'hero' }] },
            [
                field({
                    name: 'content',
                    type: 'blocks',
                    min: 2,
                    blocks: [{ type: 'hero', fields: [] }],
                }),
            ],
            fakeCtx()
        );
        expect(errors.content).toEqual(['Must have at least 2 items']);
    });

    it('applies to tree root nodes', async () => {
        const { errors } = await parseFields(
            { nav: [{ _id: 'n1', _children: [{ _id: 'n2' }, { _id: 'n3' }] }] },
            [field({ name: 'nav', type: 'tree', min: 2, fields: [] })],
            fakeCtx()
        );
        expect(errors.nav).toEqual(['Must have at least 2 items']);
    });

    it('does NOT apply to group (not an array)', async () => {
        const { errors } = await parseFields(
            { seo: { title: 'a' } },
            [
                field({
                    name: 'seo',
                    type: 'group',
                    min: 5,
                    max: 1,
                    fields: [field({ name: 'title', type: 'text' })],
                }),
            ],
            fakeCtx()
        );
        expect(errors).toEqual({});
    });

    it('does NOT apply to a non-container type', async () => {
        const { errors } = await parseFields(
            { tags: ['a'] },
            [field({ name: 'tags', type: 'multiselect', min: 3 })],
            fakeCtx()
        );
        expect(errors).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// stage inside containers
// ---------------------------------------------------------------------------

describe('stage below a container', () => {
    const sections = field({
        name: 'sections',
        type: 'repeater',
        fields: [
            field({ name: 'title', type: 'text', required: true }),
            field({ name: 'link', type: 'url' }),
        ],
    });

    it("'save' skips a required child, keyed by its _id path", async () => {
        const { errors } = await parseFields(
            { sections: [{ _id: 'a1', title: '' }] },
            [sections],
            fakeCtx('create', 'partial')
        );
        expect(errors).toEqual({});
    });

    it("'publish' reports the same required child at its _id path", async () => {
        const { errors } = await parseFields(
            { sections: [{ _id: 'a1', title: '' }] },
            [sections],
            fakeCtx('create', 'complete')
        );
        expect(errors['sections[a1].title']).toEqual(['This field is required']);
    });

    it("a correctness failure inside an item still fires on 'save'", async () => {
        const { errors } = await parseFields(
            { sections: [{ _id: 'a1', title: '', link: 'not-a-url' }] },
            [sections],
            fakeCtx('create', 'partial')
        );
        expect(errors).toEqual({ 'sections[a1].link': ['Must be a valid URL'] });
    });
});

// ---------------------------------------------------------------------------
// Scope resolution
// ---------------------------------------------------------------------------

describe('scope resolution', () => {
    it('ctx.values inside an item is the ITEM, not the root record', async () => {
        const captured: Record<string, unknown>[] = [];
        await parseFields(
            {
                password: 'root-secret',
                sections: [{ _id: 'a1', password: 'item-secret', confirm: 'x' }],
            },
            [
                field({ name: 'password', type: 'text' }),
                field({
                    name: 'sections',
                    type: 'repeater',
                    fields: [
                        field({ name: 'password', type: 'text' }),
                        field({
                            name: 'confirm',
                            type: 'text',
                            validation: [
                                {
                                    custom: async (ctx: FieldValidationContext) => {
                                        captured.push(ctx.values);
                                        return true;
                                    },
                                },
                            ],
                        }),
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(captured).toHaveLength(1);
        expect(captured[0]?.password).toBe('item-secret');
        expect(captured[0]?._id).toBe('a1');
    });

    it('a cross-field rule compares siblings within its own item', async () => {
        const { errors } = await parseFields(
            {
                sections: [
                    { _id: 'a1', a: 'x', b: 'x' },
                    { _id: 'a2', a: 'x', b: 'y' },
                ],
            },
            [
                field({
                    name: 'sections',
                    type: 'repeater',
                    fields: [
                        field({ name: 'a', type: 'text' }),
                        field({
                            name: 'b',
                            type: 'text',
                            validation: [
                                {
                                    custom: async (ctx: FieldValidationContext) =>
                                        ctx.value === ctx.values.a || 'Must match a',
                                },
                            ],
                        }),
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(errors['sections[a1].b']).toBeUndefined();
        expect(errors['sections[a2].b']).toEqual(['Must match a']);
    });

    it('ctx.path is the segment list for the field', async () => {
        let path: unknown;
        await parseFields(
            { sections: [{ _id: 'a1', title: 'x' }] },
            [
                field({
                    name: 'sections',
                    type: 'repeater',
                    fields: [
                        field({
                            name: 'title',
                            type: 'text',
                            validation: [
                                {
                                    custom: async (ctx: FieldValidationContext) => {
                                        path = ctx.path;
                                        return true;
                                    },
                                },
                            ],
                        }),
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(path).toEqual([
            { kind: 'field', name: 'sections' },
            { kind: 'item', id: 'a1' },
            { kind: 'field', name: 'title' },
        ]);
    });

    it('a top-level ctx.path is a single field segment', async () => {
        let path: unknown;
        await parseFields(
            { title: 'x' },
            [
                field({
                    name: 'title',
                    type: 'text',
                    validation: [
                        {
                            custom: async (ctx: FieldValidationContext) => {
                                path = ctx.path;
                                return true;
                            },
                        },
                    ],
                }),
            ],
            fakeCtx()
        );
        expect(path).toEqual([{ kind: 'field', name: 'title' }]);
    });
});

// ---------------------------------------------------------------------------
// Top-level keys unchanged
// ---------------------------------------------------------------------------

describe('top-level error keys', () => {
    it('a top-level field still keys by its bare name', async () => {
        const { errors } = await parseFields(
            { title: '' },
            [field({ name: 'title', type: 'text', required: true })],
            fakeCtx()
        );
        expect(Object.keys(errors)).toEqual(['title']);
    });

    it('a container error keys by the container name alone', async () => {
        const { errors } = await parseFields(
            {},
            [
                field({
                    name: 'sections',
                    type: 'repeater',
                    required: true,
                    fields: [field({ name: 'title', type: 'text' })],
                }),
            ],
            fakeCtx()
        );
        expect(Object.keys(errors)).toEqual(['sections']);
    });
});

// ---------------------------------------------------------------------------
// Field names the path grammar cannot address
// ---------------------------------------------------------------------------

describe('invalid field names', () => {
    it('a top-level name containing a dot throws, naming the field and the rule', async () => {
        await expect(
            parseFields(
                { 'user.email': 'x' },
                [field({ name: 'user.email', type: 'email' })],
                fakeCtx()
            )
        ).rejects.toThrow(
            "Field name 'user.email' (type 'email') cannot be used: field names must not contain '.', '[' or ']'"
        );
    });

    it('a bracket in a name throws the same way', async () => {
        await expect(
            parseFields({}, [field({ name: 'answers[0]', type: 'text' })], fakeCtx())
        ).rejects.toThrow(/Field name 'answers\[0\]'/);
    });

    it('a name nested inside a container throws too', async () => {
        await expect(
            parseFields(
                { seo: {} },
                [
                    field({
                        name: 'seo',
                        type: 'group',
                        fields: [field({ name: 'og.title', type: 'text' })],
                    }),
                ],
                fakeCtx()
            )
        ).rejects.toThrow(/Field name 'og.title'/);
    });

    it('an empty name throws, saying it must not be empty', async () => {
        await expect(
            parseFields({}, [field({ name: '', type: 'text' })], fakeCtx())
        ).rejects.toThrow(
            "Field name '' (type 'text') cannot be used: field names must not be empty"
        );
    });
});
