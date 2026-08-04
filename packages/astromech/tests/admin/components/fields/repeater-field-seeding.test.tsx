/**
 * @vitest-environment happy-dom
 *
 * `RepeaterField` holds its items in `useState`, whose initializer runs on the
 * FIRST render only. An entry edit route fetches its entry rather than
 * preloading it, so that first render sees no value — and without a re-seed
 * guard the repeater shows one blank row forever for an entry with plenty.
 *
 * The guard must fire once and once only: a later value change is the
 * last-saved server value arriving, and resyncing to it would clobber the
 * edit in progress. `useBlocksField` and `useTreeField` carry the same guard.
 *
 * There is no `@testing-library/react` here, so this drives a real React root
 * and real inputs directly (same approach as container-field-editing.test.tsx).
 */

import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { FieldDefinition } from '@/types/index.js';
import '@/admin/rendering/register-fields.js';
import { FormField } from '@/admin/components/fields/form-field';

const socials: FieldDefinition = {
    name: 'socials',
    type: 'repeater',
    fields: [{ name: 'url', type: 'text' }],
};

type Mounted = {
    /** Re-render the same root with a new value, as a refetch would. */
    rerender: (value: unknown) => void;
    /** The current value of the input rendered for the given full field path. */
    inputValue: (path: string) => string | null;
    /** Every rendered sub-field input, in document order. */
    inputNames: () => string[];
    /** Type into the input rendered for the given full field path. */
    typeInto: (path: string, text: string) => void;
    unmount: () => void;
};

/** Mount one repeater `FormField` whose value can change after first render. */
function mountRepeater(value: unknown): Mounted {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    const render = (next: unknown): void => {
        act(() => {
            root.render(
                <FormField field={socials} value={next} onChange={() => undefined} />
            );
        });
    };
    render(value);

    const find = (path: string): HTMLInputElement | null =>
        host.querySelector<HTMLInputElement>(`input[name="${path}"]`);

    return {
        rerender: render,
        inputValue: (path) => find(path)?.value ?? null,
        inputNames: () =>
            [...host.querySelectorAll('input')].map((el) => el.name).filter(Boolean),
        typeInto: (path, text) => {
            const input = find(path);
            if (input === null) throw new Error(`no input named "${path}"`);
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
        unmount: () => {
            act(() => root.unmount());
            host.remove();
        },
    };
}

describe('repeater seeding', () => {
    it('shows one blank item while the entry is still loading', () => {
        const f = mountRepeater(undefined);

        expect(f.inputNames()).toHaveLength(1);
        expect(f.inputValue(f.inputNames()[0] ?? '')).toBe('');

        f.unmount();
    });

    it('seeds from the value when it arrives after the first render', () => {
        const f = mountRepeater(undefined);
        f.rerender([
            { _id: 'i1', url: '/one' },
            { _id: 'i2', url: '/two' },
        ]);

        expect(f.inputValue('socials[i1].url')).toBe('/one');
        expect(f.inputValue('socials[i2].url')).toBe('/two');

        f.unmount();
    });

    it('does not resync afterwards, so an in-progress edit survives', () => {
        const f = mountRepeater(undefined);
        f.rerender([{ _id: 'i1', url: '/one' }]);
        f.typeInto('socials[i1].url', '/edited');

        // The last-saved value arriving again must not overwrite the edit.
        f.rerender([{ _id: 'i1', url: '/one' }]);
        expect(f.inputValue('socials[i1].url')).toBe('/edited');

        f.unmount();
    });
});
