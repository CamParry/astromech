/**
 * @vitest-environment happy-dom
 *
 * `useFieldControl` is the way IN for a plugin field type that renders its own
 * control rather than composing from the `astromech/ui` atoms. The atoms call it
 * themselves (see field-error-aria.test.tsx); this pins the hook's own contract,
 * because it is now public surface on `astromech/ui/fields`.
 *
 * Two halves: inside a `FieldWrapper` that has an error the hook hands back the
 * association pointing at the message the wrapper rendered, and outside one it
 * hands back nothing — so the same component is safe standalone.
 *
 * There is no `@testing-library/react` here, so this drives a real React root
 * directly (same approach as field-error-aria.test.tsx).
 */

import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import React, { act } from 'react';
import { FieldWrapper } from '@/admin/components/fields/field-wrapper';
// Through the public barrel: the point of the test is that plugins can reach it.
import { useFieldControl } from '@/admin/components/fields/index';

/** A field type's own control, of the kind a plugin would hand-roll. */
function CustomControl(): React.ReactElement {
    const { hasError, ariaProps } = useFieldControl();
    return (
        <div
            role="slider"
            tabIndex={0}
            data-testid="control"
            className={hasError ? 'is-invalid' : undefined}
            {...ariaProps}
        />
    );
}

type Mounted = { host: HTMLElement; unmount: () => void };

function mount(node: React.ReactElement): Mounted {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
        root.render(node);
    });
    return {
        host,
        unmount: () => {
            act(() => root.unmount());
            host.remove();
        },
    };
}

describe('useFieldControl', () => {
    it('associates a hand-rolled control with the wrapper’s error message', () => {
        const { host, unmount } = mount(
            <FieldWrapper label="Rating" error={['Something is wrong']}>
                <CustomControl />
            </FieldWrapper>
        );

        const message = host.querySelector('.am-field-error');
        const control = host.querySelector('[data-testid="control"]');

        expect(message?.id).toBeTruthy();
        expect(control?.getAttribute('aria-invalid')).toBe('true');
        expect(control?.getAttribute('aria-describedby')).toBe(message?.id);
        expect(control?.className).toBe('is-invalid');

        unmount();
    });

    it('carries no association when the wrapper has no error', () => {
        const { host, unmount } = mount(
            <FieldWrapper label="Rating">
                <CustomControl />
            </FieldWrapper>
        );

        const control = host.querySelector('[data-testid="control"]');

        expect(host.querySelector('.am-field-error')).toBeNull();
        expect(control?.getAttribute('aria-invalid')).toBeNull();
        expect(control?.getAttribute('aria-describedby')).toBeNull();

        unmount();
    });

    it('carries no association outside a FieldWrapper', () => {
        const { host, unmount } = mount(<CustomControl />);

        const control = host.querySelector('[data-testid="control"]');

        expect(control).not.toBeNull();
        expect(control?.getAttribute('aria-invalid')).toBeNull();
        expect(control?.getAttribute('aria-describedby')).toBeNull();

        unmount();
    });
});
