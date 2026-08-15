/**
 * @vitest-environment happy-dom
 *
 * A tree node added while EDITING an existing entry carries its declared
 * defaults.
 *
 * The field pipeline applies defaults on `create` only, so the added node would
 * otherwise reach the server bare and its declared `defaultValue`s would never
 * land. `useTreeField` seeds them at the point the node is added.
 */

import { describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { Field } from '@/types/index';
import { useTreeField, type TreeNode } from '@/admin/hooks/use-tree-field';

const FIELDS: Field[] = [
    { name: 'label', type: 'text' },
    { name: 'target', type: 'text', defaultValue: '_self' },
    {
        name: 'options',
        type: 'group',
        fields: [{ name: 'rel', type: 'text', defaultValue: 'noopener' }],
    },
];

/** Render the hook over an existing value, as an entry edit route does. */
function renderTreeField(
    value: unknown,
    onChange: (name: string, value: unknown) => void
): { current: () => ReturnType<typeof useTreeField>; unmount: () => void } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root;
    let latest: ReturnType<typeof useTreeField>;

    function Probe(): null {
        latest = useTreeField({ name: 'items', value, onChange, fields: FIELDS });
        return null;
    }

    act(() => {
        root = createRoot(container);
        root.render(<Probe />);
    });

    return { current: () => latest, unmount: () => act(() => root.unmount()) };
}

describe('useTreeField node add', () => {
    it('seeds the declared defaults of an added root node, nested ones included', () => {
        const h = renderTreeField(
            [{ _id: 'n1', label: 'One', target: '_blank' }],
            vi.fn()
        );

        act(() => h.current().addRoot());

        const nodes = h.current().nodes;
        expect(nodes).toHaveLength(2);
        expect(nodes[0]).toMatchObject({ _id: 'n1', target: '_blank' });
        expect(nodes[1]).toMatchObject({
            target: '_self',
            options: { rel: 'noopener' },
        });
        // A field with no default stays absent rather than arriving empty.
        expect(nodes[1]).not.toHaveProperty('label');

        h.unmount();
    });

    it('seeds the declared defaults of an added child node', () => {
        const onChange = vi.fn();
        const h = renderTreeField([{ _id: 'n1', label: 'One' }], onChange);

        act(() => h.current().addChild('n1'));

        const child = h.current().nodes[0]?._children?.[0];
        expect(child).toMatchObject({ target: '_self', options: { rel: 'noopener' } });
        expect(child).not.toHaveProperty('label');

        // The seeded node reaches the form, not just local state.
        const committed = onChange.mock.calls[0]?.[1] as TreeNode[];
        expect(committed[0]?._children?.[0]?.['target']).toBe('_self');

        h.unmount();
    });
});
