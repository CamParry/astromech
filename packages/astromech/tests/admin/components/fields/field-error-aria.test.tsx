/**
 * @vitest-environment happy-dom
 *
 * A field error is announced by ASSOCIATION, never by a live region.
 *
 * `FieldWrapper` used to render its message as `<p role="alert">`. An assertive
 * live region clips the name of the field the author just tabbed to, a polite
 * one appends the previous field's error after the new field's name, and either
 * way the region was mounted with its text already inside it — which several AT
 * and browser combinations never announce at all.
 *
 * What has to hold instead: the message carries an `id`, and the field's control
 * carries `aria-invalid="true"` plus an `aria-describedby` pointing at that `id`.
 * Every field type that renders a focusable control must reach that state, so
 * this walks the registry rather than checking one representative field.
 *
 * There is no `@testing-library/react` here, so this drives a real React root
 * directly (same approach as nested-field-errors.test.tsx).
 */

import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { FieldDefinition } from '@/types/index.js';
import '@/admin/definitions/register-fields.js';
import { FormField } from '@/admin/components/fields/form-field';
import { FieldErrorsProvider } from '@/admin/components/fields/field-errors-context';

type Mounted = { host: HTMLElement; unmount: () => void };

/** Mount one `FormField` whose only field is in error. */
function mountWithError(field: FieldDefinition, value: unknown): Mounted {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(
            <FieldErrorsProvider value={{ [field.name]: ['Something is wrong'] }}>
                <FormField field={field} value={value} onChange={() => undefined} />
            </FieldErrorsProvider>
        );
    });
    return {
        host,
        unmount: () => {
            act(() => root.unmount());
            host.remove();
        },
    };
}

// ============================================================================
// No live region
// ============================================================================

describe('field error markup', () => {
    it('renders the message without any live-region role', () => {
        const { host, unmount } = mountWithError({ name: 'title', type: 'text' }, '');
        const message = host.querySelector('.am-field-error');

        expect(message?.textContent).toBe('Something is wrong');
        expect(message?.getAttribute('role')).toBeNull();
        expect(message?.getAttribute('aria-live')).toBeNull();
        expect(host.querySelectorAll('[role="alert"]')).toHaveLength(0);
        expect(host.querySelectorAll('[role="status"]')).toHaveLength(0);

        unmount();
    });

    it('gives the message an id even though nothing announces it', () => {
        const { host, unmount } = mountWithError({ name: 'title', type: 'text' }, '');
        const message = host.querySelector('.am-field-error');

        expect(message?.id).toBeTruthy();

        unmount();
    });
});

// ============================================================================
// The association every control must carry
// ============================================================================

/**
 * One case per field type that renders a focusable control.
 *
 * `media` and `relationship` are excluded: both fetch over the network on mount,
 * and their only focusable control is a button rather than a form control.
 * `richtext` is excluded because its control is ProseMirror's contenteditable,
 * which needs a real layout engine to mount.
 */
const CASES: { field: FieldDefinition; value: unknown }[] = [
    { field: { name: 'f', type: 'text' }, value: '' },
    { field: { name: 'f', type: 'textarea' }, value: '' },
    { field: { name: 'f', type: 'number' }, value: null },
    { field: { name: 'f', type: 'boolean' }, value: false },
    { field: { name: 'f', type: 'date' }, value: '' },
    { field: { name: 'f', type: 'datetime' }, value: '' },
    { field: { name: 'f', type: 'email' }, value: '' },
    { field: { name: 'f', type: 'url' }, value: '' },
    { field: { name: 'f', type: 'slug' }, value: '' },
    { field: { name: 'f', type: 'color' }, value: '#000000' },
    { field: { name: 'f', type: 'json' }, value: null },
    { field: { name: 'f', type: 'link' }, value: null },
    { field: { name: 'f', type: 'key-value' }, value: { a: 'b' } },
    { field: { name: 'f', type: 'select', options: ['a', 'b'] }, value: 'a' },
    { field: { name: 'f', type: 'multiselect', options: ['a', 'b'] }, value: [] },
    { field: { name: 'f', type: 'checkbox-group', options: ['a', 'b'] }, value: [] },
    { field: { name: 'f', type: 'radio-group', options: ['a', 'b'] }, value: 'a' },
];

describe('control error association', () => {
    for (const { field, value } of CASES) {
        it(`marks the ${field.type} control invalid and describes it by the message`, () => {
            const { host, unmount } = mountWithError(field, value);
            const message = host.querySelector('.am-field-error');
            expect(message).not.toBeNull();

            const invalid = [...host.querySelectorAll('[aria-invalid="true"]')];
            expect(invalid.length).toBeGreaterThan(0);
            for (const el of invalid) {
                expect(el.getAttribute('aria-describedby')).toBe(message?.id);
            }

            unmount();
        });
    }

    it('associates every one of the link field’s three controls', () => {
        const { host, unmount } = mountWithError({ name: 'f', type: 'link' }, null);
        const message = host.querySelector('.am-field-error');
        const controls = [...host.querySelectorAll('input, select')];

        expect(controls).toHaveLength(3);
        for (const el of controls) {
            expect(el.getAttribute('aria-invalid')).toBe('true');
            expect(el.getAttribute('aria-describedby')).toBe(message?.id);
        }

        unmount();
    });

    /**
     * `range` is the one exception, and not by choice. Base UI's slider thumb is
     * a wrapper div around the `<input type="range">` that actually takes focus,
     * and forwards only the labelling/description ARIA to that input —
     * `aria-invalid` would be stranded on the role-less wrapper. The description,
     * which is the half that carries the message, does reach the control.
     */
    it('describes the range control by the message, the one case with no aria-invalid', () => {
        const { host, unmount } = mountWithError(
            { name: 'f', type: 'range', min: 0, max: 10 },
            5
        );
        const message = host.querySelector('.am-field-error');
        const input = host.querySelector('input[type="range"]');

        expect(input?.getAttribute('aria-describedby')).toBe(message?.id);

        unmount();
    });
});
