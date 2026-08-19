/**
 * @vitest-environment happy-dom
 *
 * A block added while EDITING an existing entry carries its declared defaults.
 *
 * The field pipeline applies defaults on `create` only, so the added block would
 * otherwise reach the server bare and its declared `defaultValue`s would never
 * land. `useBlocksField` seeds them at the point the block is added.
 */
import type { BlockWithId } from '@/admin/hooks/use-blocks-field';
import type { Block } from '@/types/index';
import type { Root } from 'react-dom/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { useBlocksField } from '@/admin/hooks/use-blocks-field';

const BLOCK_DEFS: Block[] = [
    {
        type: 'email',
        label: 'Email',
        fields: [
            { name: 'to', type: 'text' },
            { name: 'subject', type: 'text', defaultValue: 'New submission' },
            {
                name: 'options',
                type: 'group',
                fields: [{ name: 'replyTo', type: 'text', defaultValue: 'no-reply' }],
            },
        ],
    },
];

/** Render the hook over an existing value, as an entry edit route does. */
function renderBlocksField(
    value: unknown,
    onChange: (name: string, value: unknown) => void
): { current: () => ReturnType<typeof useBlocksField>; unmount: () => void } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let root: Root;
    let latest: ReturnType<typeof useBlocksField>;

    function Probe(): null {
        latest = useBlocksField({
            name: 'fields',
            value,
            onChange,
            blockDefs: BLOCK_DEFS,
        });
        return null;
    }

    act(() => {
        root = createRoot(container);
        root.render(<Probe />);
    });

    return { current: () => latest, unmount: () => act(() => root.unmount()) };
}

describe('useBlocksField addBlock', () => {
    it('seeds the declared defaults of the added block, nested ones included', () => {
        const onChange = vi.fn();
        const existing = [{ _id: 'b1', _type: 'email', subject: 'Kept' }];
        const h = renderBlocksField(existing, onChange);

        act(() => h.current().addBlock('email'));

        const blocks = h.current().blocks;
        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toMatchObject({ _id: 'b1', subject: 'Kept' });
        expect(blocks[1]).toMatchObject({
            _type: 'email',
            subject: 'New submission',
            options: { replyTo: 'no-reply' },
        });
        // A field with no default stays absent rather than arriving empty.
        expect(blocks[1]).not.toHaveProperty('to');

        // The seeded block reaches the form, not just local state.
        const committed = onChange.mock.calls[0]?.[1] as BlockWithId[];
        expect(committed[1]?.['subject']).toBe('New submission');
        h.unmount();
    });

    it('adds a bare block for a type with no definition', () => {
        const h = renderBlocksField([], () => undefined);

        act(() => h.current().addBlock('unknown'));

        const [block] = h.current().blocks;
        expect(Object.keys(block ?? {}).sort()).toEqual(['_id', '_type']);
        h.unmount();
    });
});
