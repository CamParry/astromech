/**
 * @vitest-environment happy-dom
 *
 * The stateful field components against a value that arrives late.
 *
 * `useEntryForm` is built with `fields: {}` while the entry is fetching and
 * `@tanstack/react-form` copies the real defaults in from a layout effect, so
 * the field tree's first render always sees an empty record — pinned in
 * `entry-form-field-seeding.test.tsx`. Any component that snapshots its value
 * into state on that render needs a re-seed guard: seed once when real data
 * arrives, and never resync, or the last-saved value clobbers an edit.
 *
 * `blocks` and `tree` carry that guard through `useBlocksField` / `useTreeField`,
 * `json` carries its own, and `richtext` seeds the TipTap document from an
 * effect. All four are checked here at the component level.
 */

import type { Field } from '@/types/index';
import { act, cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import '@/admin/rendering/register-fields';
import { FormField } from '@/admin/components/fields/form-field';

afterEach(cleanup);

type Commit = { name: string; value: unknown };

type Mounted = {
    /** Every `onChange` the field has fired, oldest first. */
    commits: Commit[];
    /** Push a new value down, as the default-value copy landing would. */
    rerender: (value: unknown) => void;
    /** The value of the most recent commit. */
    last: () => unknown;
};

/**
 * Mount one `FormField` whose value starts undefined, as the fetching entry
 * leaves it, and can be replaced later.
 */
function mountField(field: Field, value: unknown): Mounted {
    const commits: Commit[] = [];
    let push!: (value: unknown) => void;

    function Holder(): React.ReactElement {
        const [current, setCurrent] = React.useState(value);
        push = setCurrent;
        return (
            <FormField
                field={field}
                value={current}
                onChange={(name, changed) => commits.push({ name, value: changed })}
            />
        );
    }

    render(<Holder />);

    return {
        commits,
        rerender: (next) => act(() => push(next)),
        last: () => commits.at(-1)?.value,
    };
}

function input(name: string): HTMLInputElement {
    const el = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (el === null) {
        throw new Error(
            `no control named "${name}"; rendered: ${[
                ...document.querySelectorAll('input, textarea'),
            ]
                .map((e) => e.getAttribute('name'))
                .join(', ')}`
        );
    }
    return el;
}

describe('blocks on a fetched entry', () => {
    const content: Field = {
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

    const stored = [
        { _id: 'b1', _type: 'hero', heading: 'One', subheading: 'First' },
        { _id: 'b2', _type: 'hero', heading: 'Two', subheading: 'Second' },
    ];

    it('renders no blocks before the value arrives', () => {
        mountField(content, undefined);

        expect(document.querySelectorAll('input')).toHaveLength(0);
    });

    it('seeds from the value when it arrives after the first render', () => {
        const f = mountField(content, undefined);

        f.rerender(stored);

        expect(input('content[b1].heading').value).toBe('One');
        expect(input('content[b2].heading').value).toBe('Two');
    });

    it('does not resync afterwards, so an in-progress edit survives', async () => {
        const user = userEvent.setup();
        const f = mountField(content, undefined);
        f.rerender(stored);

        await user.clear(input('content[b2].heading'));
        await user.type(input('content[b2].heading'), 'Edited');
        // The last-saved value arriving again must not undo the edit.
        f.rerender(structuredClone(stored));

        expect(input('content[b2].heading').value).toBe('Edited');
    });

    it('keeps the untouched siblings of an edited block', async () => {
        const user = userEvent.setup();
        const f = mountField(content, undefined);
        f.rerender(stored);

        await user.clear(input('content[b2].heading'));
        await user.type(input('content[b2].heading'), 'Edited');

        expect(f.last()).toEqual([
            { _id: 'b1', _type: 'hero', heading: 'One', subheading: 'First' },
            { _id: 'b2', _type: 'hero', heading: 'Edited', subheading: 'Second' },
        ]);
    });
});

describe('tree on a fetched entry', () => {
    const nav: Field = {
        name: 'nav',
        type: 'tree',
        fields: [
            { name: 'label', type: 'text' },
            { name: 'href', type: 'text' },
        ],
    };

    // Node ids are unique tree-wide, so a child addresses the same way a root
    // does — `_children` never appears in the path.
    const stored = [
        {
            _id: 'n1',
            label: 'Products',
            href: '/products',
            _children: [{ _id: 'n2', label: 'Shoes', href: '/shoes' }],
        },
        { _id: 'n3', label: 'About', href: '/about' },
    ];

    it('renders no nodes before the value arrives', () => {
        mountField(nav, undefined);

        expect(document.querySelectorAll('input')).toHaveLength(0);
    });

    it('seeds the whole tree, children included, when the value arrives late', () => {
        const f = mountField(nav, undefined);

        f.rerender(stored);

        expect(input('nav[n1].label').value).toBe('Products');
        expect(input('nav[n2].label').value).toBe('Shoes');
        expect(input('nav[n3].label').value).toBe('About');
    });

    it('does not resync afterwards, so an in-progress edit survives', async () => {
        const user = userEvent.setup();
        const f = mountField(nav, undefined);
        f.rerender(stored);

        await user.clear(input('nav[n2].label'));
        await user.type(input('nav[n2].label'), 'Boots');
        f.rerender(structuredClone(stored));

        expect(input('nav[n2].label').value).toBe('Boots');
    });

    it('keeps the untouched siblings of an edited child node', async () => {
        const user = userEvent.setup();
        const f = mountField(nav, undefined);
        f.rerender(stored);

        await user.clear(input('nav[n2].label'));
        await user.type(input('nav[n2].label'), 'Boots');

        expect(f.last()).toEqual([
            {
                _id: 'n1',
                label: 'Products',
                href: '/products',
                _children: [{ _id: 'n2', label: 'Boots', href: '/shoes' }],
            },
            { _id: 'n3', label: 'About', href: '/about' },
        ]);
    });
});

// json — snapshots its text with no re-seed guard (open defect)

describe('json on a fetched entry', () => {
    const data: Field = { name: 'data', type: 'json' };

    it('renders the stored JSON when the value is already there', () => {
        mountField(data, { alpha: 1 });

        expect(input('data').value).toBe('{\n  "alpha": 1\n}');
    });

    it('renders the stored JSON when the value arrives late', () => {
        const f = mountField(data, undefined);

        f.rerender({ alpha: 1 });

        expect(input('data').value).toBe('{\n  "alpha": 1\n}');
    });

    it('does not commit null over the stored JSON on blur', async () => {
        const user = userEvent.setup();
        const f = mountField(data, undefined);
        f.rerender({ alpha: 1 });

        await user.click(input('data'));
        await user.tab();

        expect(f.commits).toEqual([]);
    });
});

// richtext — TipTap applies `content` only when it builds the editor (open defect)

describe('richtext on a fetched entry', () => {
    const body: Field = { name: 'body', type: 'richtext' };
    const doc = {
        type: 'doc',
        content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Stored prose' }] },
        ],
    };

    function prose(): string {
        return document.querySelector('.am-richtext-content')?.textContent ?? '';
    }

    async function settle(): Promise<void> {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
        });
    }

    it('renders the stored document when the value is already there', async () => {
        mountField(body, doc);
        await settle();

        expect(prose()).toBe('Stored prose');
    });

    it('renders the stored document when the value arrives late', async () => {
        const f = mountField(body, undefined);
        await settle();

        f.rerender(doc);
        await settle();

        expect(prose()).toBe('Stored prose');
        // The programmatic seed must not fire `onUpdate`.
        expect(f.commits).toEqual([]);
    });

    it('does not resync afterwards, so an in-progress edit survives', async () => {
        const user = userEvent.setup();
        const f = mountField(body, undefined);
        await settle();
        f.rerender(doc);
        await settle();

        const content = document.querySelector<HTMLElement>('.am-richtext-content');
        if (content === null) throw new Error('no editor content');
        await user.click(content);
        await user.type(content, 'Edited');
        await settle();
        const edited = prose();
        expect(edited).not.toBe('Stored prose');

        // The last-saved value arriving again must not undo the edit.
        f.rerender(structuredClone(doc));
        await settle();

        expect(prose()).toBe(edited);
    });
});
