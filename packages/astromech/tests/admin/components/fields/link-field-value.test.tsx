/**
 * @vitest-environment happy-dom
 *
 * `LinkField` must commit the shape the contract describes.
 *
 * It used to read and write `href` while the descriptor and `validateLink` both
 * required `url`, so every entry holding a link failed client-side validation on
 * save. It also rebuilt the value from a fixed key list, silently dropping any
 * other key the value carried. Both are checked here against the real validator.
 *
 * There is no `@testing-library/react` here, so this drives a real React root
 * and real inputs directly (same approach as container-field-editing.test.tsx).
 */

import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { Field, FieldValidationContext } from '@/types/index';
import '@/admin/rendering/register-fields';
import { FormField } from '@/admin/components/fields/form-field';
import { validateLink } from '@/fields/built-in-rules';

const cta: Field = { name: 'cta', type: 'link' };

type Mounted = {
    /** Type into the input rendered for the given control name. */
    typeInto: (name: string, text: string) => void;
    /** The value of the most recent commit, as a plain object. */
    lastValue: () => Record<string, unknown>;
    unmount: () => void;
};

/** Mount one link `FormField` and capture what it commits. */
function mountLink(value: unknown): Mounted {
    const commits: unknown[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(
            <FormField
                field={cta}
                value={value}
                onChange={(_name, next) => commits.push(next)}
            />
        );
    });

    return {
        typeInto: (name, text) => {
            const input = host.querySelector<HTMLInputElement>(`input[name="${name}"]`);
            if (input === null) {
                throw new Error(
                    `no input named "${name}"; rendered: ${[
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
        lastValue: () => {
            const last = commits.at(-1);
            if (last === undefined) throw new Error('no commit was made');
            return last as Record<string, unknown>;
        },
        unmount: () => {
            act(() => root.unmount());
            host.remove();
        },
    };
}

function ctx(value: unknown): FieldValidationContext {
    return {
        value,
        values: {},
        field: cta,
        path: [{ kind: 'field', name: 'cta' }],
        operation: 'create',
        validation: 'complete',
        resource: { kind: 'entry', record: null },
        user: null,
        lookups: { isUnique: async () => true },
    };
}

describe('link field value', () => {
    it('renders the url control under the canonical key', () => {
        const f = mountLink(null);
        expect(() => f.typeInto('cta[url]', 'https://example.com')).not.toThrow();
        f.unmount();
    });

    it('commits the typed url under `url`, not `href`', () => {
        const f = mountLink(null);
        f.typeInto('cta[url]', 'https://example.com');

        expect(f.lastValue()['url']).toBe('https://example.com');
        expect(f.lastValue()).not.toHaveProperty('href');

        f.unmount();
    });

    it('commits a value the shared validator accepts', async () => {
        const f = mountLink(null);
        f.typeInto('cta[url]', '/features');
        f.typeInto('cta[label]', 'See the features');

        expect(await validateLink(ctx(f.lastValue()))).toBe(true);

        f.unmount();
    });

    it('reads an existing url back into the control', () => {
        const f = mountLink({ url: '/pricing', label: 'Pricing', target: '_self' });
        f.typeInto('cta[label]', 'Plans');

        expect(f.lastValue()['url']).toBe('/pricing');

        f.unmount();
    });

    it('preserves keys it does not edit', () => {
        const f = mountLink({ url: '/pricing', rel: 'nofollow' });
        f.typeInto('cta[label]', 'Plans');

        expect(f.lastValue()['rel']).toBe('nofollow');

        f.unmount();
    });
});
