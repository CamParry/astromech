/**
 * @vitest-environment happy-dom
 *
 * `FormField` is the only place a field's FULL `_id`-bracket path is known.
 *
 * Containers deliberately drop the path when bubbling a change up — `group` and
 * `repeater` both call `onChange(_path, value)` and discard `_path`, because
 * they key their own value by the BARE sub-field name. So a validation reporter
 * hooked in anywhere above `FormField` sees `link`, never `items[i1].link`, and
 * would mark the wrong path dirty.
 *
 * Blur is the mirror problem: React's `onBlur` is `focusout` and bubbles, so
 * without `stopPropagation` every enclosing container would also report a blur
 * the author never performed on it.
 *
 * There is no `@testing-library/react` here, so this drives a real React root
 * and real inputs directly (same approach as container-field-editing.test.tsx).
 */

import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { Field } from '@/types/index';
import '@/admin/rendering/register-fields';
import { FormField } from '@/admin/components/fields/form-field';
import { FieldValidationProvider } from '@/admin/components/fields/field-validation-context';

type Mounted = {
    /** Paths reported as changed, oldest first. */
    changed: string[];
    /** Paths reported as blurred, oldest first. */
    blurred: string[];
    typeInto: (path: string, text: string) => void;
    blur: (path: string) => void;
    unmount: () => void;
};

function mountField(field: Field, value: unknown): Mounted {
    const changed: string[] = [];
    const blurred: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(
            <FieldValidationProvider
                value={{
                    onFieldChange: (path) => changed.push(path),
                    onFieldBlur: (path) => blurred.push(path),
                }}
            >
                <FormField field={field} value={value} onChange={() => undefined} />
            </FieldValidationProvider>
        );
    });

    const inputFor = (path: string): HTMLInputElement => {
        const input = host.querySelector<HTMLInputElement>(`input[name="${path}"]`);
        if (input === null) {
            throw new Error(
                `no input named "${path}"; rendered: ${[...host.querySelectorAll('input')]
                    .map((el) => el.getAttribute('name'))
                    .join(', ')}`
            );
        }
        return input;
    };

    return {
        changed,
        blurred,
        typeInto: (path, text) => {
            const input = inputFor(path);
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
        blur: (path) => {
            const input = inputFor(path);
            act(() => {
                // React's `onBlur` listens for the bubbling `focusout`, not the
                // non-bubbling `blur`.
                input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
            });
        },
        unmount: () => {
            act(() => root.unmount());
            host.remove();
        },
    };
}

// ============================================================================
// Change — reported against the full path
// ============================================================================

describe('change reporting', () => {
    it('should report a top-level change under the bare field name', () => {
        const f = mountField({ name: 'title', type: 'text' }, '');

        f.typeInto('title', 'Hello');

        expect(f.changed).toEqual(['title']);
        f.unmount();
    });

    it('should report a group sub-field change under its dotted path', () => {
        const quote: Field = {
            name: 'quote',
            type: 'group',
            fields: [{ name: 'text', type: 'text' }],
        };
        const f = mountField(quote, { text: '' });

        f.typeInto('quote.text', 'Hello');

        // The bare name `text` — what any consumer above `FormField` would see —
        // is never reported. The container is marked dirty too, because each
        // level's `FormField` wraps the one below in turn.
        expect(f.changed).toEqual(['quote.text', 'quote']);
        f.unmount();
    });

    it('should report a repeater sub-field change keyed by the item id', () => {
        const items: Field = {
            name: 'items',
            type: 'repeater',
            fields: [{ name: 'link', type: 'text' }],
        };
        const f = mountField(items, [
            { _id: 'i1', link: '' },
            { _id: 'i2', link: '' },
        ]);

        f.typeInto('items[i2].link', 'https://example.com');

        expect(f.changed).toEqual(['items[i2].link', 'items']);
        f.unmount();
    });
});

// ============================================================================
// Blur — reported by the innermost wrapper only
// ============================================================================

describe('blur reporting', () => {
    it('should report a top-level blur under the bare field name', () => {
        const f = mountField({ name: 'title', type: 'text' }, '');

        f.blur('title');

        expect(f.blurred).toEqual(['title']);
        f.unmount();
    });

    it('should report only the innermost path when a nested field blurs', () => {
        const items: Field = {
            name: 'items',
            type: 'repeater',
            fields: [{ name: 'link', type: 'text' }],
        };
        const f = mountField(items, [{ _id: 'i1', link: '' }]);

        f.blur('items[i1].link');

        // Without `stopPropagation` the bubbling focusout would also hit the
        // repeater's own wrapper and report `items`.
        expect(f.blurred).toEqual(['items[i1].link']);
        f.unmount();
    });

    it('should report only the innermost path through two levels of nesting', () => {
        const sections: Field = {
            name: 'sections',
            type: 'repeater',
            fields: [
                {
                    name: 'seo',
                    type: 'group',
                    fields: [{ name: 'title', type: 'text' }],
                },
            ],
        };
        const f = mountField(sections, [{ _id: 's1', seo: { title: '' } }]);

        f.blur('sections[s1].seo.title');

        expect(f.blurred).toEqual(['sections[s1].seo.title']);
        f.unmount();
    });
});

// ============================================================================
// No provider — every other FormField consumer is unaffected
// ============================================================================

describe('without a provider', () => {
    it('should render and accept input with no validation handlers in scope', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        const commits: unknown[] = [];
        act(() => {
            root.render(
                <FormField
                    field={{ name: 'title', type: 'text' }}
                    value=""
                    onChange={(_name, next) => commits.push(next)}
                />
            );
        });

        const input = host.querySelector<HTMLInputElement>('input[name="title"]');
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        )?.set;
        setter?.call(input, 'Hello');
        act(() => {
            input?.dispatchEvent(new Event('input', { bubbles: true }));
        });

        expect(commits).toEqual(['Hello']);
        act(() => root.unmount());
        host.remove();
    });
});
