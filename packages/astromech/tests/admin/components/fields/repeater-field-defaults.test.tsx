/**
 * @vitest-environment happy-dom
 *
 * A repeater item added while EDITING an existing entry carries its declared
 * defaults.
 *
 * The field pipeline applies defaults on `create` only, so the added item would
 * otherwise reach the server bare and its declared `defaultValue`s would never
 * land. `RepeaterField` seeds them at the point the item is added.
 *
 * There is no `@testing-library/react` here, so this drives a real React root
 * and clicks the real add button (same approach as repeater-field-seeding).
 */

import { describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { Field } from '@/types/index';
import '@/admin/rendering/register-fields';
import { FormField } from '@/admin/components/fields/form-field';

const socials: Field = {
    name: 'socials',
    type: 'repeater',
    fields: [
        { name: 'url', type: 'text' },
        { name: 'label', type: 'text', defaultValue: 'Follow us' },
        {
            name: 'options',
            type: 'group',
            fields: [{ name: 'rel', type: 'text', defaultValue: 'noopener' }],
        },
    ],
};

type Mounted = {
    /** Click the repeater's add button. */
    add: () => void;
    unmount: () => void;
};

/** Mount one repeater `FormField` over an existing value, as an edit route does. */
function mountRepeater(
    value: unknown,
    onChange: (name: string, value: unknown) => void
): Mounted {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
        root.render(<FormField field={socials} value={value} onChange={onChange} />);
    });

    return {
        add: () => {
            const button = host.querySelector<HTMLButtonElement>('.am-repeater-btn-add');
            if (button === null) throw new Error('no add button');
            act(() => button.click());
        },
        unmount: () => {
            act(() => root.unmount());
            host.remove();
        },
    };
}

describe('repeater handleAdd', () => {
    it('seeds the declared defaults of the added item, nested ones included', () => {
        const onChange = vi.fn();
        const f = mountRepeater([{ _id: 'i1', url: '/one', label: 'Kept' }], onChange);

        f.add();

        const committed = onChange.mock.calls[0]?.[1] as Record<string, unknown>[];
        expect(committed).toHaveLength(2);
        expect(committed[0]).toMatchObject({ _id: 'i1', label: 'Kept' });
        expect(committed[1]).toMatchObject({
            label: 'Follow us',
            options: { rel: 'noopener' },
        });
        // A field with no default stays absent rather than arriving empty.
        expect(committed[1]).not.toHaveProperty('url');

        f.unmount();
    });
});
