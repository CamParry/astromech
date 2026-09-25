/**
 * @vitest-environment happy-dom
 *
 * `useFieldsForm` and `<FieldsForm>` over a flat record: a submit hands the
 * values to the caller's write, a 422 lands on the named field or in the
 * banner, a read-only form disables every field and submits nothing, and the
 * unsaved-changes guard holds only while the form is dirty.
 */

import type { Field } from '@/types/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import React from 'react';
import { initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import '@/admin/rendering/register-fields';
import { FieldsForm } from '@/admin/components/forms/fields-form';
import { ToastProvider } from '@/admin/components/ui/toast';
import { useFieldsForm } from '@/admin/hooks/use-fields-form';
import { AstromechApiError } from '@/transport/http/client';

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: {} } },
    });
});

/** A redirect, as a plugin would declare it. */
const FIELDS: Field[] = [
    { name: 'from', type: 'text', label: 'From', required: true },
    { name: 'to', type: 'text', label: 'To', required: true },
];

type Write = (values: { fields: Record<string, unknown> }) => Promise<unknown>;

function RedirectForm({
    onSubmit,
    readOnly,
    to,
}: {
    onSubmit: Write;
    readOnly: boolean;
    to: string;
}): React.ReactElement {
    const form = useFieldsForm({
        fieldDefinitions: FIELDS,
        operation: 'create',
        defaultValues: { fields: { from: '/old', to } },
        onSubmit,
        readOnly,
    });
    return (
        <FieldsForm
            form={form}
            sidebar={
                <button type="button" onClick={() => form.handleSubmit()}>
                    Save
                </button>
            }
        />
    );
}

function mount(onSubmit: Write, { readOnly = false, to = '' } = {}): void {
    render(
        <QueryClientProvider client={new QueryClient()}>
            <ToastProvider>
                <RedirectForm onSubmit={onSubmit} readOnly={readOnly} to={to} />
            </ToastProvider>
        </QueryClientProvider>
    );
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

/** Fire `beforeunload` and report whether the form asked to keep the tab open. */
function unloadIsBlocked(): boolean {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
}

describe('FieldsForm', () => {
    it('hands the values to the write on submit', async () => {
        const onSubmit = vi.fn<Write>(async () => ({ id: 'r1' }));
        mount(onSubmit);

        await userEvent.type(inputNamed('to'), '/new');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        expect(onSubmit.mock.calls[0]?.[0]).toEqual({
            fields: { from: '/old', to: '/new' },
        });
    });

    it('stops a submit the field pipeline rejects', async () => {
        const onSubmit = vi.fn<Write>(async () => ({ id: 'r1' }));
        mount(onSubmit);

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
        mount(onSubmit);

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
        mount(onSubmit);

        await userEvent.type(inputNamed('to'), '/new');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        const banner = await screen.findByRole('alert');
        expect(banner.textContent).toBe('The redirect points at itself');
    });

    it('disables every field and submits nothing when read-only', async () => {
        const onSubmit = vi.fn<Write>(async () => ({ id: 'r1' }));
        // Valid values, so only the read-only flag stands between a click and a write.
        mount(onSubmit, { readOnly: true, to: '/new' });

        expect(inputNamed('from').disabled).toBe(true);
        expect(inputNamed('to').disabled).toBe(true);

        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        await userEvent.keyboard('{Control>}s{/Control}{Meta>}s{/Meta}');

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('guards the tab only while there are unsaved changes', async () => {
        mount(async () => ({ id: 'r1' }));

        expect(unloadIsBlocked()).toBe(false);

        await userEvent.type(inputNamed('to'), '/new');
        expect(unloadIsBlocked()).toBe(true);
    });

    it('clears the guard once a save succeeds', async () => {
        const onSubmit = vi.fn<Write>(async () => ({ id: 'r1' }));
        mount(onSubmit);

        await userEvent.type(inputNamed('to'), '/new');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

        await waitFor(() => expect(unloadIsBlocked()).toBe(false));
    });
});
