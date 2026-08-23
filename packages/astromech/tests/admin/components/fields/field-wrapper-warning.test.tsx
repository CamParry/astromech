/**
 * @vitest-environment happy-dom
 *
 * A warning is advisory, so it describes the control without invalidating it:
 * `aria-describedby` yes, `aria-invalid` no. And an error supersedes it — two
 * messages under one field leave the author guessing which to act on.
 *
 * There is no `@testing-library/react` here, so this drives a real React root
 * directly (same approach as use-field-control.test.tsx).
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { useFieldControl } from '@/admin/components/fields/field-control-context';
import { FieldWrapper } from '@/admin/components/fields/field-wrapper';

/** A field type's own control, of the kind a plugin would hand-roll. */
function CustomControl(): React.ReactElement {
    const { ariaProps } = useFieldControl();
    return <div role="textbox" tabIndex={0} data-testid="control" {...ariaProps} />;
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

describe('FieldWrapper warnings', () => {
    it('renders the warning and describes the control without invalidating it', () => {
        const { host, unmount } = mount(
            <FieldWrapper label="Summary" warning={['A bit long for a summary']}>
                <CustomControl />
            </FieldWrapper>
        );

        const message = host.querySelector('.am-field-warning');
        const control = host.querySelector('[data-testid="control"]');

        expect(message?.textContent).toBe('A bit long for a summary');
        expect(message?.id).toBeTruthy();
        expect(control?.getAttribute('aria-describedby')).toBe(message?.id);
        expect(control?.getAttribute('aria-invalid')).toBeNull();
        expect(host.querySelector('.am-field')?.hasAttribute('data-warning')).toBe(true);

        unmount();
    });

    it('renders only the error when a field has both, and marks it invalid', () => {
        const { host, unmount } = mount(
            <FieldWrapper
                label="Summary"
                error={['Too short']}
                warning={['A bit long for a summary']}
            >
                <CustomControl />
            </FieldWrapper>
        );

        const message = host.querySelector('.am-field-error');
        const control = host.querySelector('[data-testid="control"]');
        const field = host.querySelector('.am-field');

        expect(host.querySelector('.am-field-warning')).toBeNull();
        expect(message?.textContent).toBe('Too short');
        expect(control?.getAttribute('aria-invalid')).toBe('true');
        expect(control?.getAttribute('aria-describedby')).toBe(message?.id);
        expect(field?.hasAttribute('data-invalid')).toBe(true);
        expect(field?.hasAttribute('data-warning')).toBe(false);

        unmount();
    });

    it('renders nothing and carries no association with an empty warning list', () => {
        const { host, unmount } = mount(
            <FieldWrapper label="Summary" warning={[]}>
                <CustomControl />
            </FieldWrapper>
        );

        const control = host.querySelector('[data-testid="control"]');

        expect(host.querySelector('.am-field-warning')).toBeNull();
        expect(control?.getAttribute('aria-describedby')).toBeNull();

        unmount();
    });
});
