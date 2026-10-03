/**
 * @vitest-environment happy-dom
 *
 * `useFieldsForm` and `<FieldsForm>` over a flat record: a submit hands the
 * values to the caller's write, a 422 lands on the named field or in the
 * banner, a read-only form disables every field and submits nothing, the
 * unsaved-changes guard holds the tab and in-app links only while the form is
 * dirty, and Cmd+S saves from anywhere but a modal dialog.
 */

import type { RenderAdminResult } from '../../_support/render-admin';
import type { Field } from '@/types/index';
import { Popover } from '@base-ui/react/popover';
import { Link, useNavigate } from '@tanstack/react-router';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FieldsForm } from '@/admin/components/forms/fields-form';
import { Modal } from '@/admin/components/ui/modal';
import { useFieldsForm } from '@/admin/hooks/use-fields-form';
import { AstromechApiError } from '@/transport/http/client';
import { renderAdmin } from '../../_support/render-admin';

/** A redirect, as a plugin would declare it. */
const FIELDS: Field[] = [
    { name: 'from', type: 'text', label: 'From', required: true },
    { name: 'to', type: 'text', label: 'To', required: true },
];

type Write = (values: { fields: Record<string, unknown> }) => Promise<unknown>;

/** A create form, with a link away and, when `redirect` is set, a redirect once saved. */
function RedirectForm({
    onSubmit,
    readOnly,
    to,
    redirect,
}: {
    onSubmit: Write;
    readOnly: boolean;
    to: string;
    redirect: string | undefined;
}): React.ReactElement {
    const navigate = useNavigate();
    const form = useFieldsForm({
        fieldDefinitions: FIELDS,
        operation: 'create',
        defaultValues: { fields: { from: '/old', to } },
        onSubmit,
        onSuccess: () => {
            if (redirect !== undefined) void navigate({ to: redirect });
        },
        readOnly,
    });
    return (
        <FieldsForm
            form={form}
            sidebar={
                <>
                    <button type="button" onClick={() => form.handleSubmit()}>
                        Save
                    </button>
                    <Link to="/users">Leave</Link>
                </>
            }
        />
    );
}

/** Render the form at `/`, once its fields are on screen. */
async function mount(
    onSubmit: Write,
    { readOnly = false, to = '', redirect = undefined as string | undefined } = {}
): Promise<RenderAdminResult> {
    const page = renderAdmin(
        <RedirectForm
            onSubmit={onSubmit}
            readOnly={readOnly}
            to={to}
            redirect={redirect}
        />
    );
    await waitFor(() => inputNamed('to'));
    return page;
}

/** The unsaved-changes dialog, once it is open. */
function discardDialog(): Promise<HTMLElement> {
    return screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' });
}

function inputNamed(name: string): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (input === null) throw new Error(`no input named "${name}"`);
    return input;
}

function unprocessable(details: Record<string, unknown>): AstromechApiError {
    return new AstromechApiError({
        id: 'e1',
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        status: 422,
        details,
    });
}

/** Cmd+S on a Mac, Ctrl+S elsewhere: the form's hotkey is whichever this platform uses. */
const SAVE_KEYS = '{Control>}s{/Control}{Meta>}s{/Meta}';

/** A valid form with a popover or a modal dialog open over it, each holding a button. */
function FormUnderOverlay({
    onSubmit,
    overlay,
}: {
    onSubmit: Write;
    overlay: 'popover' | 'modal';
}): React.ReactElement {
    const form = useFieldsForm({
        fieldDefinitions: FIELDS,
        operation: 'update',
        defaultValues: { fields: { from: '/old', to: '/new' } },
        onSubmit,
    });
    const [open, setOpen] = useState(true);
    return (
        <>
            <FieldsForm form={form} />
            {overlay === 'modal' ? (
                <Modal open={open} onClose={() => setOpen(false)} title="Pick a page">
                    <button type="button">Inside</button>
                </Modal>
            ) : (
                <Popover.Root defaultOpen>
                    <Popover.Trigger>Options</Popover.Trigger>
                    <Popover.Portal>
                        <Popover.Positioner>
                            <Popover.Popup>
                                <button type="button">Inside</button>
                            </Popover.Popup>
                        </Popover.Positioner>
                    </Popover.Portal>
                </Popover.Root>
            )}
        </>
    );
}

/** Fire `beforeunload` and report whether the form asked to keep the tab open. */
function unloadIsBlocked(): boolean {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
}

describe('FieldsForm', () => {
    it('hands the values to the write on submit', async () => {
        const onSubmit = vi.fn<Write>(async () => ({ id: 'r1' }));
        await mount(onSubmit);

        await userEvent.type(inputNamed('to'), '/new');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        expect(onSubmit.mock.calls[0]?.[0]).toEqual({
            fields: { from: '/old', to: '/new' },
        });
    });

    it('stops a submit the field pipeline rejects', async () => {
        const onSubmit = vi.fn<Write>(async () => ({ id: 'r1' }));
        await mount(onSubmit);

        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        // The required `to` field is empty, so its message shows and nothing is written.
        await waitFor(() =>
            expect(inputNamed('to').getAttribute('aria-invalid')).toBe('true')
        );
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('puts a 422 field error on the field it names', async () => {
        const onSubmit = vi.fn<Write>(async () => {
            throw unprocessable({ fields: { from: ['A redirect from /old exists'] } });
        });
        await mount(onSubmit);

        await userEvent.type(inputNamed('to'), '/new');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByText('A redirect from /old exists')).not.toBeNull();
        expect(inputNamed('from').getAttribute('aria-invalid')).toBe('true');
        expect(inputNamed('to').getAttribute('aria-invalid')).not.toBe('true');
    });

    it('puts a 422 form error in the banner', async () => {
        const onSubmit = vi.fn<Write>(async () => {
            throw unprocessable({ form: ['The redirect points at itself'] });
        });
        await mount(onSubmit);

        await userEvent.type(inputNamed('to'), '/new');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        const banner = await screen.findByRole('alert');
        expect(banner.textContent).toBe('The redirect points at itself');
    });

    it('disables every field and submits nothing when read-only', async () => {
        const onSubmit = vi.fn<Write>(async () => ({ id: 'r1' }));
        // Valid values, so only the read-only flag stands between a click and a write.
        await mount(onSubmit, { readOnly: true, to: '/new' });

        expect(inputNamed('from').disabled).toBe(true);
        expect(inputNamed('to').disabled).toBe(true);

        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        await userEvent.keyboard('{Control>}s{/Control}{Meta>}s{/Meta}');

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('guards the tab only while there are unsaved changes', async () => {
        await mount(async () => ({ id: 'r1' }));

        expect(unloadIsBlocked()).toBe(false);

        await userEvent.type(inputNamed('to'), '/new');
        expect(unloadIsBlocked()).toBe(true);
    });

    it('clears the guard once a save succeeds', async () => {
        const onSubmit = vi.fn<Write>(async () => ({ id: 'r1' }));
        await mount(onSubmit);

        await userEvent.type(inputNamed('to'), '/new');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

        await waitFor(() => expect(unloadIsBlocked()).toBe(false));
    });

    it('asks before a link leaves a dirty form, and staying keeps the edits', async () => {
        const page = await mount(async () => ({ id: 'r1' }));

        await page.user.type(inputNamed('to'), '/new');
        await page.user.click(screen.getByRole('link', { name: 'Leave' }));
        const dialog = await discardDialog();
        await page.user.click(
            within(dialog).getByRole('button', { name: 'Keep editing' })
        );

        await waitFor(() => expect(dialog.isConnected).toBe(false));
        expect(page.pathname()).toBe('/');
        expect(inputNamed('to').value).toBe('/new');
    });

    it('leaves a dirty form once the editor discards the changes', async () => {
        const page = await mount(async () => ({ id: 'r1' }));

        await page.user.type(inputNamed('to'), '/new');
        await page.user.click(screen.getByRole('link', { name: 'Leave' }));
        const dialog = await discardDialog();
        await page.user.click(
            within(dialog).getByRole('button', { name: 'Discard changes' })
        );

        await waitFor(() => expect(page.pathname()).toBe('/users'));
    });

    it('leaves a clean form without asking', async () => {
        const page = await mount(async () => ({ id: 'r1' }), { to: '/new' });

        await page.user.click(screen.getByRole('link', { name: 'Leave' }));

        await waitFor(() => expect(page.pathname()).toBe('/users'));
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('redirects after a save without asking', async () => {
        const onSubmit = vi.fn<Write>(async () => ({ id: 'r1' }));
        const page = await mount(onSubmit, { redirect: '/saved' });

        await page.user.type(inputNamed('to'), '/new');
        await page.user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(page.pathname()).toBe('/saved'));
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('saves on Cmd+S while focus is in a field', async () => {
        const onSubmit = vi.fn<Write>(async () => ({ id: 'r1' }));
        await mount(onSubmit);

        await userEvent.type(inputNamed('to'), '/new');
        await userEvent.keyboard(SAVE_KEYS);

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        expect(onSubmit.mock.calls[0]?.[0]).toEqual({
            fields: { from: '/old', to: '/new' },
        });
    });

    it('saves on Cmd+S from a button inside a popover', async () => {
        const onSubmit = vi.fn<Write>(async () => ({ id: 'r1' }));
        renderAdmin(<FormUnderOverlay onSubmit={onSubmit} overlay="popover" />);

        (await screen.findByRole('button', { name: 'Inside' })).focus();
        await userEvent.keyboard(SAVE_KEYS);

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    });

    it('leaves Cmd+S in a modal dialog to the dialog', async () => {
        const onSubmit = vi.fn<Write>(async () => ({ id: 'r1' }));
        renderAdmin(<FormUnderOverlay onSubmit={onSubmit} overlay="modal" />);

        const dialog = await screen.findByRole('dialog', { name: 'Pick a page' });
        screen.getByRole('button', { name: 'Inside' }).focus();
        await userEvent.keyboard(SAVE_KEYS);
        await userEvent.keyboard('{Escape}');
        await waitFor(() => expect(dialog.isConnected).toBe(false));

        // Once the dialog is gone the same keys save, and only this once.
        await userEvent.keyboard(SAVE_KEYS);
        await waitFor(() => expect(onSubmit).toHaveBeenCalled());
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });
});
