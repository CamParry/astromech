/**
 * @vitest-environment happy-dom
 *
 * Log out is a navigation to `/logout`, whose route ends the session, so a
 * form with unsaved changes asks before the editor is signed out.
 */

import type { AuthUser } from '@/admin/context/auth';
import type { Field } from '@/types/index';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldsForm } from '@/admin/components/forms/fields-form';
import { Topbar } from '@/admin/components/layout/topbar';
import { CommandPaletteProvider } from '@/admin/components/ui/command-palette';
import { sessionQueryOptions } from '@/admin/context/auth';
import { useFieldsForm } from '@/admin/hooks/use-fields-form';
import { renderAdmin } from '../../_support/render-admin';

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: {
            ...real.astromechUntypedClient,
            notifications: {
                count: vi.fn(async () => ({ count: 0 })),
                list: vi.fn(async () => ({ data: [] })),
            },
        },
    };
});

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

const FIELDS: Field[] = [{ name: 'headline', type: 'text', label: 'Headline' }];

/** An edit page under the topbar, inside the provider the app shell supplies. */
function EditPage() {
    const form = useFieldsForm({
        fieldDefinitions: FIELDS,
        operation: 'update',
        defaultValues: { fields: { headline: '' } },
        onSubmit: async () => ({ id: 'r1' }),
    });
    return (
        <CommandPaletteProvider>
            <Topbar />
            <FieldsForm form={form} />
        </CommandPaletteProvider>
    );
}

/** Edit the form, then choose Log out from the user menu. */
async function logOutOverUnsavedEdits() {
    const page = renderAdmin(<EditPage />, { url: '/entries/post/p1' });
    const headline = (await screen.findByLabelText('Headline')) as HTMLInputElement;
    await page.user.type(headline, 'Unsaved');
    await page.user.click(screen.getByRole('button', { name: 'User menu' }));
    await page.user.click(await screen.findByRole('menuitem', { name: 'Logout' }));
    const dialog = await screen.findByRole('alertdialog', {
        name: 'Discard unsaved changes?',
    });
    return { page, headline, dialog };
}

describe('logging out over unsaved changes', () => {
    it('asks first, and staying keeps the session and the edits', async () => {
        const { page, headline, dialog } = await logOutOverUnsavedEdits();

        await page.user.click(
            within(dialog).getByRole('button', { name: 'Keep editing' })
        );

        await waitFor(() => expect(dialog.isConnected).toBe(false));
        expect(fetchMock).not.toHaveBeenCalled();
        expect(
            page.queryClient.getQueryData<AuthUser | null>(sessionQueryOptions.queryKey)
        ).not.toBeNull();
        expect(page.pathname()).toBe('/entries/post/p1');
        expect(headline.value).toBe('Unsaved');
    });

    it('goes to the logout route once the editor discards the edits', async () => {
        const { page, dialog } = await logOutOverUnsavedEdits();

        await page.user.click(
            within(dialog).getByRole('button', { name: 'Discard changes' })
        );

        await waitFor(() => expect(page.pathname()).toBe('/logout'));
    });
});
