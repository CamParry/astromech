import { describe, expect, it } from 'vitest';
import type { FieldPathSegment } from '@/fields/field-path.js';
import {
    formatFieldPath,
    formatSchemaPath,
    isValidFieldName,
    parseFieldPath,
} from '@/fields/field-path.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function f(name: string): FieldPathSegment {
    return { kind: 'field', name };
}

function item(id: string): FieldPathSegment {
    return { kind: 'item', id };
}

// ---------------------------------------------------------------------------
// isValidFieldName
// ---------------------------------------------------------------------------

describe('isValidFieldName', () => {
    const valid = [
        'title',
        'firstName',
        'my_field_2',
        'my-field',
        'UPPER',
        '_leading',
        '9',
        'a b', // a space is ugly, but the grammar does not spend it
        'héllo',
        'a{b}c',
    ];

    for (const name of valid) {
        it(`accepts '${name}'`, () => {
            expect(isValidFieldName(name)).toBe(true);
        });
    }

    const invalid = ['', 'user.email', '.', 'a[', 'a]', 'a[0]', 'blocks[a1].title'];

    for (const name of invalid) {
        it(`rejects '${name}'`, () => {
            expect(isValidFieldName(name)).toBe(false);
        });
    }

    it('agrees with formatFieldPath on every case', () => {
        for (const name of valid) {
            expect(() => formatFieldPath([f(name)])).not.toThrow();
        }
        for (const name of invalid) {
            expect(() => formatFieldPath([f(name)])).toThrow();
        }
    });
});

// ---------------------------------------------------------------------------
// formatFieldPath — happy paths
// ---------------------------------------------------------------------------

describe('formatFieldPath', () => {
    it('single field', () => {
        expect(formatFieldPath([f('title')])).toBe('title');
    });

    it('group child: dot-joined fields', () => {
        expect(formatFieldPath([f('seo'), f('title')])).toBe('seo.title');
    });

    it('deeply nested groups', () => {
        expect(formatFieldPath([f('a'), f('b'), f('c'), f('d')])).toBe('a.b.c.d');
    });

    it('blocks child: item selector attaches with no dot', () => {
        expect(formatFieldPath([f('blocks'), item('6f1e2a'), f('heading')])).toBe(
            'blocks[6f1e2a].heading'
        );
    });

    it('repeater nested in a repeater', () => {
        expect(
            formatFieldPath([
                f('sections'),
                item('a1'),
                f('items'),
                item('b2'),
                f('title'),
            ])
        ).toBe('sections[a1].items[b2].title');
    });

    it('tree node: depth never appears, ids are tree-unique', () => {
        expect(formatFieldPath([f('nav'), item('9bb'), f('label')])).toBe(
            'nav[9bb].label'
        );
    });

    it('item selector may be the last segment (the item itself)', () => {
        expect(formatFieldPath([f('blocks'), item('c3')])).toBe('blocks[c3]');
    });

    it('consecutive item selectors chain without dots', () => {
        expect(formatFieldPath([f('matrix'), item('x'), item('y')])).toBe('matrix[x][y]');
    });

    it('uuid ids (containing dashes) are preserved verbatim', () => {
        const id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
        expect(formatFieldPath([f('blocks'), item(id), f('body')])).toBe(
            `blocks[${id}].body`
        );
    });

    it('an id containing a dot is still a single segment', () => {
        expect(formatFieldPath([f('blocks'), item('a.b'), f('title')])).toBe(
            'blocks[a.b].title'
        );
    });
});

// ---------------------------------------------------------------------------
// formatFieldPath — throw cases
// ---------------------------------------------------------------------------

describe('formatFieldPath validation', () => {
    it('throws on an empty segment array', () => {
        expect(() => formatFieldPath([])).toThrow(/at least one segment/);
    });

    it('throws when the first segment is an item selector', () => {
        expect(() => formatFieldPath([item('a1'), f('title')])).toThrow(
            /must start with a field segment/
        );
    });

    it('throws on an empty field name', () => {
        expect(() => formatFieldPath([f('')])).toThrow(/name must not be empty/);
    });

    it('throws on a field name containing a dot', () => {
        expect(() => formatFieldPath([f('a.b')])).toThrow(/must not contain/);
    });

    it('throws on a field name containing an opening bracket', () => {
        expect(() => formatFieldPath([f('a[')])).toThrow(/must not contain/);
    });

    it('throws on a field name containing a closing bracket', () => {
        expect(() => formatFieldPath([f('a]')])).toThrow(/must not contain/);
    });

    it('throws on a nested field name containing a dot', () => {
        expect(() => formatFieldPath([f('seo'), f('a.b')])).toThrow(/must not contain/);
    });

    it('throws on an empty item id', () => {
        expect(() => formatFieldPath([f('blocks'), item('')])).toThrow(
            /item id must not be empty/
        );
    });

    it('throws on an item id containing an opening bracket', () => {
        expect(() => formatFieldPath([f('blocks'), item('a[b')])).toThrow(
            /item id must not contain/
        );
    });

    it('throws on an item id containing a closing bracket', () => {
        expect(() => formatFieldPath([f('blocks'), item('a]b')])).toThrow(
            /item id must not contain/
        );
    });
});

// ---------------------------------------------------------------------------
// formatSchemaPath
// ---------------------------------------------------------------------------

describe('formatSchemaPath', () => {
    it('matches the instance path when there are no item selectors', () => {
        expect(formatSchemaPath([f('seo'), f('title')])).toBe('seo.title');
    });

    it('collapses an item selector to empty brackets', () => {
        expect(formatSchemaPath([f('blocks'), item('6f1e2a'), f('heading')])).toBe(
            'blocks[].heading'
        );
    });

    it('collapses every item selector in a nested path', () => {
        expect(
            formatSchemaPath([
                f('sections'),
                item('a1'),
                f('items'),
                item('b2'),
                f('title'),
            ])
        ).toBe('sections[].items[].title');
    });

    it('tree nodes at any depth share one schema path', () => {
        const shallow = formatSchemaPath([f('nav'), item('9bb'), f('label')]);
        const deep = formatSchemaPath([f('nav'), item('deeply-nested'), f('label')]);
        expect(shallow).toBe('nav[].label');
        expect(deep).toBe(shallow);
    });

    it('trailing item selector renders as empty brackets', () => {
        expect(formatSchemaPath([f('blocks'), item('c3')])).toBe('blocks[]');
    });

    it('applies the same validation rules as formatFieldPath', () => {
        expect(() => formatSchemaPath([])).toThrow(/at least one segment/);
        expect(() => formatSchemaPath([item('a1')])).toThrow(
            /must start with a field segment/
        );
        expect(() => formatSchemaPath([f('a.b')])).toThrow(/must not contain/);
        expect(() => formatSchemaPath([f('blocks'), item('')])).toThrow(
            /item id must not be empty/
        );
    });
});

// ---------------------------------------------------------------------------
// parseFieldPath — happy paths
// ---------------------------------------------------------------------------

describe('parseFieldPath', () => {
    it('single field', () => {
        expect(parseFieldPath('title')).toEqual([f('title')]);
    });

    it('dot-joined fields', () => {
        expect(parseFieldPath('seo.title')).toEqual([f('seo'), f('title')]);
    });

    it('item selector', () => {
        expect(parseFieldPath('blocks[6f1e2a].heading')).toEqual([
            f('blocks'),
            item('6f1e2a'),
            f('heading'),
        ]);
    });

    it('nested item selectors', () => {
        expect(parseFieldPath('sections[a1].items[b2].title')).toEqual([
            f('sections'),
            item('a1'),
            f('items'),
            item('b2'),
            f('title'),
        ]);
    });

    it('trailing item selector', () => {
        expect(parseFieldPath('blocks[c3]')).toEqual([f('blocks'), item('c3')]);
    });

    it('consecutive item selectors', () => {
        expect(parseFieldPath('matrix[x][y]')).toEqual([
            f('matrix'),
            item('x'),
            item('y'),
        ]);
    });

    it('uuid id', () => {
        expect(
            parseFieldPath('blocks[3f2504e0-4f89-11d3-9a0c-0305e82c3301].body')
        ).toEqual([f('blocks'), item('3f2504e0-4f89-11d3-9a0c-0305e82c3301'), f('body')]);
    });

    it('an id containing a dot is not split on the dot', () => {
        expect(parseFieldPath('blocks[a.b].title')).toEqual([
            f('blocks'),
            item('a.b'),
            f('title'),
        ]);
    });
});

// ---------------------------------------------------------------------------
// parseFieldPath — throw cases
// ---------------------------------------------------------------------------

describe('parseFieldPath validation', () => {
    it('throws on an empty string', () => {
        expect(() => parseFieldPath('')).toThrow(/must not be empty/);
    });

    it('throws on a path starting with an item selector', () => {
        expect(() => parseFieldPath('[a1].title')).toThrow(
            /must start with a field name/
        );
    });

    it('throws on an unterminated opening bracket', () => {
        expect(() => parseFieldPath('foo[')).toThrow(/unterminated item selector/);
    });

    it('throws on an unterminated opening bracket with an id', () => {
        expect(() => parseFieldPath('foo[a1')).toThrow(/unterminated item selector/);
    });

    it('throws on a nested opening bracket inside a selector', () => {
        expect(() => parseFieldPath('foo[a[b]')).toThrow(/unterminated item selector/);
    });

    it('throws on an unmatched closing bracket', () => {
        expect(() => parseFieldPath('foo]')).toThrow(/unmatched/);
    });

    it('throws on a stray closing bracket after a selector', () => {
        expect(() => parseFieldPath('foo[a1]]')).toThrow(/unexpected/);
    });

    it('throws on an empty selector (a schema path is not an instance path)', () => {
        expect(() => parseFieldPath('foo[]')).toThrow(/empty item selector/);
    });

    it('throws on an empty selector mid-path', () => {
        expect(() => parseFieldPath('sections[].items[b2].title')).toThrow(
            /empty item selector/
        );
    });

    it('throws on a doubled dot', () => {
        expect(() => parseFieldPath('foo..bar')).toThrow(/empty component/);
    });

    it('throws on a leading dot', () => {
        expect(() => parseFieldPath('.foo')).toThrow(/empty component/);
    });

    it('throws on a trailing dot', () => {
        expect(() => parseFieldPath('foo.')).toThrow(/must not end with/);
    });

    it('throws on a lone dot', () => {
        expect(() => parseFieldPath('.')).toThrow(/empty component/);
    });

    it('throws on a dot immediately after a selector', () => {
        expect(() => parseFieldPath('foo[a1]..bar')).toThrow(/empty component/);
    });
});

// ---------------------------------------------------------------------------
// Round trip
// ---------------------------------------------------------------------------

describe('round trip', () => {
    const cases: { label: string; segments: FieldPathSegment[] }[] = [
        { label: 'single field', segments: [f('title')] },
        { label: 'group child', segments: [f('seo'), f('title')] },
        { label: 'deep groups', segments: [f('a'), f('b'), f('c'), f('d')] },
        {
            label: 'blocks child',
            segments: [f('blocks'), item('6f1e2a'), f('heading')],
        },
        { label: 'trailing item', segments: [f('blocks'), item('c3')] },
        {
            label: 'nested repeaters',
            segments: [f('sections'), item('a1'), f('items'), item('b2'), f('title')],
        },
        { label: 'tree node', segments: [f('nav'), item('9bb'), f('label')] },
        {
            label: 'consecutive items',
            segments: [f('matrix'), item('x'), item('y')],
        },
        {
            label: 'uuid id',
            segments: [
                f('blocks'),
                item('3f2504e0-4f89-11d3-9a0c-0305e82c3301'),
                f('body'),
            ],
        },
        { label: 'id with a dot', segments: [f('blocks'), item('a.b'), f('title')] },
        {
            label: 'field name with underscores and digits',
            segments: [f('my_field_2'), item('id-1'), f('sub_field')],
        },
    ];

    for (const { label, segments } of cases) {
        it(`${label} survives format → parse`, () => {
            expect(parseFieldPath(formatFieldPath(segments))).toEqual(segments);
        });
    }
});
