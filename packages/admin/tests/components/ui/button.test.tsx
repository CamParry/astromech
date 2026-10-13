/**
 * @vitest-environment happy-dom
 *
 * `Button` is a plain button unless it says otherwise, so a form that holds
 * one does not submit when Enter is pressed in a text field (Strapi #22833
 * deleted a repeatable item this way). A button that submits opts in with
 * `type="submit"`.
 */

import type { FormEvent } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/admin/components/ui/button';

describe('Button', () => {
    it('renders type="button" by default', () => {
        render(<Button>Add item</Button>);

        expect(
            screen.getByRole('button', { name: 'Add item' }).getAttribute('type')
        ).toBe('button');
    });

    it('passes type="submit" through', () => {
        render(<Button type="submit">Save</Button>);

        expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe(
            'submit'
        );
    });

    it('does not submit its form when Enter is pressed in a text field', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
        const onRemove = vi.fn();
        // Two fields, so the form has no implicit submission without a
        // submit button.
        render(
            <form onSubmit={onSubmit}>
                <input aria-label="Title" />
                <input aria-label="Subtitle" />
                <Button onClick={onRemove}>Remove item</Button>
                <Button>Add item</Button>
            </form>
        );

        await user.type(screen.getByLabelText('Title'), 'Hello{Enter}');

        expect(onRemove).not.toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('submits its form on Enter when it is the submit button', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
        render(
            <form onSubmit={onSubmit}>
                <input aria-label="Title" />
                <input aria-label="Subtitle" />
                <Button type="submit">Save</Button>
            </form>
        );

        await user.type(screen.getByLabelText('Title'), 'Hello{Enter}');

        expect(onSubmit).toHaveBeenCalledOnce();
    });
});
