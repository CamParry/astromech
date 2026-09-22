/**
 * @vitest-environment happy-dom
 *
 * `LinkField` must commit the shape the contract describes: it reads and writes
 * `url`, the key the descriptor and `validateLink` require, and keeps any other
 * key the value carries. Both are checked here against the real validator.
 */

import type { DataField, FieldValidationContext } from '@/types/index';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/admin/rendering/register-fields';
import { FormField } from '@/admin/components/fields/form-field';
import { validateLink } from '@/fields/built-in-rules';

const cta: DataField = { name: 'cta', type: 'link' };

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
    const { container: host, unmount } = render(
        <FormField
            field={cta}
            value={value}
            onChange={(_name, next) => commits.push(next)}
        />
    );

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
        unmount,
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
        isUnique: async () => true,
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
