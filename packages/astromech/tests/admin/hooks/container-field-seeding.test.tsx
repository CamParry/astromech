/**
 * @vitest-environment happy-dom
 *
 * Seeding regression for the two stateful container hooks.
 *
 * Both hold their items in `useState`, whose initializer runs on the FIRST
 * render only. An entry edit route FETCHES its entry rather than preloading it,
 * so the first render sees `undefined` — and before the fix the field stayed
 * empty forever, rendering "No blocks yet" for an entry full of blocks. It
 * looked intermittent because a warm query cache could make the data present on
 * the first render.
 *
 * The other half matters just as much: once seeded, a later render must NOT
 * resync, or every keystroke would be clobbered by the last-saved value.
 *
 * There is no `@testing-library/react` here, so this drives a real React root
 * directly — enough to render a hook and step through prop changes.
 */

import { describe, expect, it } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useBlocksField } from '@/admin/hooks/use-blocks-field.js';
import { useTreeField } from '@/admin/hooks/use-tree-field.js';

type Harness<T> = {
    current: () => T;
    setValue: (value: unknown) => void;
    unmount: () => void;
};

/** Render a value-taking hook and allow the `value` prop to change over time. */
function renderValueHook<T>(hook: (value: unknown) => T, initial: unknown): Harness<T> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root;
    let latest: T;
    let setValue!: (value: unknown) => void;

    function Probe(): null {
        const [value, set] = React.useState<unknown>(initial);
        setValue = set;
        latest = hook(value);
        return null;
    }

    act(() => {
        root = createRoot(container);
        root.render(<Probe />);
    });

    return {
        current: () => latest,
        setValue: (value) => act(() => setValue(value)),
        unmount: () => act(() => root.unmount()),
    };
}

/** These hooks call `onChange` on commit; the seeding behaviour under test ignores it. */
const noop = (): void => undefined;

const BLOCKS = [
    { _id: 'b1', _type: 'text', name: 'name' },
    { _id: 'b2', _type: 'email', name: 'email' },
];

describe('useBlocksField seeding', () => {
    it('seeds when the value arrives after the first render', () => {
        const h = renderValueHook(
            (v) => useBlocksField({ name: 'fields', value: v, onChange: noop }),
            undefined
        );
        expect(h.current().blocks).toHaveLength(0);

        h.setValue(BLOCKS);

        expect(h.current().blocks.map((b) => b._id)).toEqual(['b1', 'b2']);
        h.unmount();
    });

    it('does not clobber edits when a later render carries the old value', () => {
        const h = renderValueHook(
            (v) => useBlocksField({ name: 'fields', value: v, onChange: noop }),
            BLOCKS
        );

        act(() => h.current().removeBlock('b1'));
        expect(h.current().blocks.map((b) => b._id)).toEqual(['b2']);

        // A re-render still handing over the last-saved value must not undo it.
        h.setValue([...BLOCKS]);

        expect(h.current().blocks.map((b) => b._id)).toEqual(['b2']);
        h.unmount();
    });
});

describe('useTreeField seeding', () => {
    it('seeds when the value arrives after the first render', () => {
        const nodes = [{ _id: 'n1', label: 'One' }];
        const h = renderValueHook(
            (v) => useTreeField({ name: 'items', value: v, onChange: noop }),
            undefined
        );
        expect(h.current().nodes).toHaveLength(0);

        h.setValue(nodes);

        expect(h.current().nodes.map((n) => n._id)).toEqual(['n1']);
        h.unmount();
    });
});
