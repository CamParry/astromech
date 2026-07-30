/**
 * @vitest-environment happy-dom
 *
 * Container fields must key an edited sub-field by its BARE name.
 *
 * `FormField` hands a sub-field two different strings: `field.name` (the bare
 * key, `url`) and `name` (the FULL path, `socials[<id>].url`, used for error
 * lookup and sibling reads). Leaf components report the FULL path back through
 * `onChange(name, value)` — so a container that uses the reported name as an
 * object key writes a junk key literally called `socials[<id>].url` and never
 * touches `url`. In the browser that looked like typing doing nothing at all.
 *
 * Every assertion here therefore checks two things: the bare key holds the new
 * value, AND no key is path-shaped. The second is the one that pins the bug —
 * the junk key was written *alongside* the untouched bare key, so a test that
 * only looked for `url` would have passed while the field was broken.
 *
 * There is no `@testing-library/react` here, so this drives a real React root
 * and real inputs directly (same approach as container-field-seeding.test.tsx).
 */

import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { FieldDefinition } from '@/types/index.js';
import '@/admin/definitions/register-fields.js';
import { FormField } from '@/admin/components/fields/form-field';

type Commit = { name: string; value: unknown };

type Mounted = {
    /** Every `onChange` the container has fired, oldest first. */
    commits: Commit[];
    /** Type into the input rendered for the given full field path. */
    typeInto: (path: string, text: string) => void;
    /** The value of the most recent commit, as an array of item objects. */
    lastItems: () => Record<string, unknown>[];
    /** The value of the most recent commit, as a plain object. */
    lastObject: () => Record<string, unknown>;
    unmount: () => void;
};

/** Mount one container `FormField` and capture what it commits. */
function mountField(field: FieldDefinition, value: unknown): Mounted {
    const commits: Commit[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(
            <FormField
                field={field}
                value={value}
                onChange={(name, next) => commits.push({ name, value: next })}
            />
        );
    });

    const last = (): unknown => {
        const commit = commits.at(-1);
        if (commit === undefined) throw new Error('no commit was made');
        return commit.value;
    };

    return {
        commits,
        typeInto: (path, text) => {
            const input = host.querySelector<HTMLInputElement>(`input[name="${path}"]`);
            if (input === null) {
                throw new Error(
                    `no input named "${path}"; rendered: ${[
                        ...host.querySelectorAll('input'),
                    ]
                        .map((el) => el.getAttribute('name'))
                        .join(', ')}`
                );
            }
            // React caches the last value it saw on the node, so setting `value`
            // through the prototype setter (bypassing React's instance setter) is
            // what makes it treat the following `input` event as a real change.
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            )?.set;
            setter?.call(input, text);
            act(() => {
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        },
        lastItems: () => last() as Record<string, unknown>[],
        lastObject: () => last() as Record<string, unknown>,
        unmount: () => {
            act(() => root.unmount());
            host.remove();
        },
    };
}

/**
 * Keys that look like a field path rather than a bare name. The bug wrote
 * `socials[i1].url` as a literal key, so any `.`, `[` or `]` is the smoking gun.
 */
function pathShapedKeys(obj: Record<string, unknown>): string[] {
    return Object.keys(obj).filter((key) => /[.[\]]/.test(key));
}

// ============================================================================
// repeater
// ============================================================================

describe('repeater sub-field editing', () => {
    const socials: FieldDefinition = {
        name: 'socials',
        type: 'repeater',
        fields: [
            { name: 'url', type: 'text' },
            { name: 'label', type: 'text' },
        ],
    };

    const items = [
        { _id: 'i1', url: '', label: 'First' },
        { _id: 'i2', url: '', label: 'Second' },
    ];

    it('should commit the edited sub-field under its bare name', () => {
        const f = mountField(socials, items);

        f.typeInto('socials[i2].url', 'https://example.com');

        expect(f.lastItems()[1]).toEqual({
            _id: 'i2',
            url: 'https://example.com',
            label: 'Second',
        });
        f.unmount();
    });

    it('should not key the committed item by the full field path', () => {
        const f = mountField(socials, items);

        f.typeInto('socials[i2].url', 'https://example.com');

        expect(pathShapedKeys(f.lastItems()[1] ?? {})).toEqual([]);
        f.unmount();
    });

    it('should leave the other items untouched', () => {
        const f = mountField(socials, items);

        f.typeInto('socials[i2].url', 'https://example.com');

        expect(f.lastItems()[0]).toEqual({ _id: 'i1', url: '', label: 'First' });
        f.unmount();
    });

    it('should re-render the input with the value just typed', () => {
        const f = mountField(socials, items);

        // The user-visible symptom: the junk key meant `item.url` never changed,
        // so the controlled input snapped straight back to empty.
        f.typeInto('socials[i1].url', 'typed');

        expect(f.lastItems()[0]?.url).toBe('typed');
        f.unmount();
    });

    it('should commit the whole array under the container path', () => {
        const f = mountField(socials, items);

        f.typeInto('socials[i1].url', 'typed');

        expect(f.commits.at(-1)?.name).toBe('socials');
        expect(f.lastItems()).toHaveLength(2);
        f.unmount();
    });
});

// ============================================================================
// group
// ============================================================================

describe('group sub-field editing', () => {
    const quote: FieldDefinition = {
        name: 'quote',
        type: 'group',
        fields: [
            { name: 'text', type: 'text' },
            { name: 'author', type: 'text' },
        ],
    };

    it('should commit the edited sub-field under its bare name', () => {
        const f = mountField(quote, { text: '', author: 'Ada' });

        f.typeInto('quote.text', 'Hello');

        expect(f.lastObject()).toEqual({ text: 'Hello', author: 'Ada' });
        f.unmount();
    });

    it('should not key the committed group by the full field path', () => {
        const f = mountField(quote, { text: '', author: 'Ada' });

        f.typeInto('quote.text', 'Hello');

        expect(pathShapedKeys(f.lastObject())).toEqual([]);
        f.unmount();
    });

    it('should commit the group object under the container path', () => {
        const f = mountField(quote, { text: '', author: 'Ada' });

        f.typeInto('quote.author', 'Grace');

        expect(f.commits.at(-1)?.name).toBe('quote');
        expect(f.lastObject().author).toBe('Grace');
        f.unmount();
    });
});

// ============================================================================
// blocks
// ============================================================================

describe('blocks sub-field editing', () => {
    const content: FieldDefinition = {
        name: 'content',
        type: 'blocks',
        blocks: [
            {
                type: 'hero',
                fields: [
                    { name: 'heading', type: 'text' },
                    { name: 'subheading', type: 'text' },
                ],
            },
        ],
    };

    const blocks = [
        { _id: 'b1', _type: 'hero', heading: '', subheading: 'One' },
        { _id: 'b2', _type: 'hero', heading: '', subheading: 'Two' },
    ];

    it('should commit the edited sub-field under its bare name', () => {
        const f = mountField(content, blocks);

        f.typeInto('content[b2].heading', 'Launch day');

        expect(f.lastItems()[1]).toEqual({
            _id: 'b2',
            _type: 'hero',
            heading: 'Launch day',
            subheading: 'Two',
        });
        f.unmount();
    });

    it('should not key the committed block by the full field path', () => {
        const f = mountField(content, blocks);

        f.typeInto('content[b2].heading', 'Launch day');

        expect(pathShapedKeys(f.lastItems()[1] ?? {})).toEqual([]);
        f.unmount();
    });

    it('should leave the other blocks untouched', () => {
        const f = mountField(content, blocks);

        f.typeInto('content[b2].heading', 'Launch day');

        expect(f.lastItems()[0]).toEqual({
            _id: 'b1',
            _type: 'hero',
            heading: '',
            subheading: 'One',
        });
        f.unmount();
    });
});

// ============================================================================
// tree
// ============================================================================

describe('tree sub-field editing', () => {
    const nav: FieldDefinition = {
        name: 'nav',
        type: 'tree',
        fields: [
            { name: 'label', type: 'text' },
            { name: 'href', type: 'text' },
        ],
    };

    // Node ids are unique tree-wide, so a child addresses the same way a root
    // does — `_children` never appears in the path.
    const nodes = [
        {
            _id: 'n1',
            label: '',
            href: '/',
            _children: [{ _id: 'n2', label: '', href: '/about' }],
        },
    ];

    it('should commit the edited root sub-field under its bare name', () => {
        const f = mountField(nav, nodes);

        f.typeInto('nav[n1].label', 'Home');

        expect(f.lastItems()[0]?.label).toBe('Home');
        expect(pathShapedKeys(f.lastItems()[0] ?? {})).toEqual([]);
        f.unmount();
    });

    it('should commit an edited child sub-field under its bare name', () => {
        const f = mountField(nav, nodes);

        f.typeInto('nav[n2].label', 'About');

        const children = f.lastItems()[0]?._children as Record<string, unknown>[];
        expect(children[0]).toEqual({ _id: 'n2', label: 'About', href: '/about' });
        f.unmount();
    });

    it('should not key a committed child node by the full field path', () => {
        const f = mountField(nav, nodes);

        f.typeInto('nav[n2].label', 'About');

        const children = f.lastItems()[0]?._children as Record<string, unknown>[];
        expect(pathShapedKeys(children[0] ?? {})).toEqual([]);
        f.unmount();
    });

    it('should leave the parent node fields untouched when a child changes', () => {
        const f = mountField(nav, nodes);

        f.typeInto('nav[n2].label', 'About');

        expect(f.lastItems()[0]?.label).toBe('');
        expect(f.lastItems()[0]?.href).toBe('/');
        f.unmount();
    });
});

// ============================================================================
// nesting — the recursion, not just one level
// ============================================================================

describe('group nested in a repeater item', () => {
    const people: FieldDefinition = {
        name: 'people',
        type: 'repeater',
        fields: [
            { name: 'name', type: 'text' },
            {
                name: 'address',
                type: 'group',
                fields: [
                    { name: 'city', type: 'text' },
                    { name: 'country', type: 'text' },
                ],
            },
        ],
    };

    const items = [
        { _id: 'p1', name: 'Ada', address: { city: '', country: 'UK' } },
        { _id: 'p2', name: 'Grace', address: { city: '', country: 'US' } },
    ];

    it('should commit the nested sub-field under bare names at both levels', () => {
        const f = mountField(people, items);

        f.typeInto('people[p2].address.city', 'Baltimore');

        expect(f.lastItems()[1]).toEqual({
            _id: 'p2',
            name: 'Grace',
            address: { city: 'Baltimore', country: 'US' },
        });
        f.unmount();
    });

    it('should not key either level by the full field path', () => {
        const f = mountField(people, items);

        f.typeInto('people[p2].address.city', 'Baltimore');

        const item = f.lastItems()[1] ?? {};
        expect(pathShapedKeys(item)).toEqual([]);
        expect(pathShapedKeys((item.address ?? {}) as Record<string, unknown>)).toEqual(
            []
        );
        f.unmount();
    });
});

describe('repeater nested in a repeater item', () => {
    const sections: FieldDefinition = {
        name: 'sections',
        type: 'repeater',
        fields: [
            { name: 'title', type: 'text' },
            {
                name: 'links',
                type: 'repeater',
                fields: [{ name: 'href', type: 'text' }],
            },
        ],
    };

    const items = [
        {
            _id: 's1',
            title: 'Docs',
            links: [{ _id: 'l1', href: '' }],
        },
    ];

    it('should commit the inner sub-field under bare names at both levels', () => {
        const f = mountField(sections, items);

        f.typeInto('sections[s1].links[l1].href', '/guide');

        expect(f.lastItems()[0]).toEqual({
            _id: 's1',
            title: 'Docs',
            links: [{ _id: 'l1', href: '/guide' }],
        });
        f.unmount();
    });

    it('should not key either level by the full field path', () => {
        const f = mountField(sections, items);

        f.typeInto('sections[s1].links[l1].href', '/guide');

        const outer = f.lastItems()[0] ?? {};
        const inner = (outer.links ?? []) as Record<string, unknown>[];
        expect(pathShapedKeys(outer)).toEqual([]);
        expect(pathShapedKeys(inner[0] ?? {})).toEqual([]);
        f.unmount();
    });
});
