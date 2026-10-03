/**
 * @vitest-environment happy-dom
 *
 * An upload asks for the media fields only when a required one has no default,
 * or when the server refuses the fields: the dialog sends what the author fills
 * in as each file's `data.fields`, a 422 lands on the field it names while the
 * dialog stays open, and a retry sends only the files not yet uploaded.
 */

import type { UserEvent } from '@testing-library/user-event';
import type React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaPicker } from '@/admin/components/media/media-picker';
import { useFieldsForm } from '@/admin/hooks/use-fields-form';
import { AstromechApiError } from '@/transport/http/client';
import { renderAdmin } from '../../_support/render-admin';

const { adminConfig, mediaQuery, uploadMedia } = vi.hoisted(() => ({
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en'],
        mediaRoute: '/_media',
        imageWidths: [] as number[],
        media: { translatable: false, fields: [] as unknown[] },
    },
    mediaQuery: vi.fn(),
    uploadMedia: vi.fn(),
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: {
            ...real.astromechUntypedClient,
            media: { query: mediaQuery, upload: uploadMedia },
        },
    };
});

const credit = { name: 'credit', type: 'text', label: 'Credit', required: true };

beforeEach(() => {
    adminConfig.media.fields = [];
    mediaQuery.mockResolvedValue({ data: [], pagination: { total: 0, pages: 1 } });
    uploadMedia.mockResolvedValue({ id: 'm1' });
});

afterEach(() => {
    mediaQuery.mockReset();
    uploadMedia.mockReset();
});

/** Render the picker for a viewer who may upload, beside `page` when given. */
function renderPicker(page?: React.ReactElement): UserEvent {
    const { user } = renderAdmin(
        <>
            {page}
            <MediaPicker
                query={{ q: '', type: 'all', page: 1 }}
                onQueryChange={vi.fn()}
                selectedIds={[]}
                onPick={vi.fn()}
                multiple
            />
        </>,
        { permissions: ['media:read', 'media:upload'] }
    );
    return user;
}

/** Pick `names` as image files in the picker's file input. */
async function pickFiles(user: UserEvent, names: string[]): Promise<void> {
    await screen.findAllByRole('button', { name: /Upload/ });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) throw new Error('the picker renders no file input');
    await user.upload(
        input,
        names.map((name) => new File(['bytes'], name, { type: 'image/png' }))
    );
}

async function uploadPhoto(): Promise<UserEvent> {
    const user = renderPicker();
    await pickFiles(user, ['photo.png']);
    return user;
}

/** The names of the files `media.upload` was sent, in order. */
function uploadedNames(): string[] {
    return uploadMedia.mock.calls.map(([input]) => (input as { file: File }).file.name);
}

function unprocessable(fields: Record<string, string[]>): AstromechApiError {
    return new AstromechApiError({
        id: 'e1',
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        status: 422,
        details: { fields },
    });
}

async function fillCreditAndUpload(user: UserEvent): Promise<HTMLElement> {
    const dialog = await screen.findByRole('dialog', { name: 'Upload 1 file' });
    await user.type(within(dialog).getByLabelText(/Credit/), 'Ann');
    await user.click(within(dialog).getByRole('button', { name: 'Upload' }));
    return dialog;
}

describe('an upload with media fields', () => {
    it('uploads straight away when every required field has a default', async () => {
        adminConfig.media.fields = [{ ...credit, defaultValue: 'Staff' }];

        await uploadPhoto();

        await waitFor(() => expect(uploadMedia).toHaveBeenCalledOnce());
        expect(uploadMedia).toHaveBeenCalledWith({ file: expect.any(File) });
        expect(screen.queryByRole('dialog', { name: 'Upload 1 file' })).toBeNull();
    });

    it('asks for a required field with no default and sends it as data.fields', async () => {
        adminConfig.media.fields = [credit];

        const user = await uploadPhoto();
        expect(uploadMedia).not.toHaveBeenCalled();
        await fillCreditAndUpload(user);

        await waitFor(() => expect(uploadMedia).toHaveBeenCalledOnce());
        expect(uploadMedia).toHaveBeenCalledWith({
            file: expect.any(File),
            data: { fields: { credit: 'Ann' } },
        });
        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: 'Upload 1 file' })).toBeNull()
        );
        expect(await screen.findByText('1 file uploaded.')).toBeDefined();
    });

    it('shows a 422 field error on the field it names and stays open', async () => {
        adminConfig.media.fields = [credit];
        uploadMedia.mockRejectedValue(unprocessable({ credit: ['Credit is too short'] }));

        const user = await uploadPhoto();
        const dialog = await fillCreditAndUpload(user);

        expect(await within(dialog).findByText('Credit is too short')).toBeDefined();
        expect(screen.getByRole('dialog', { name: 'Upload 1 file' })).toBe(dialog);
    });

    it('keeps only the files not yet uploaded after a failure, and retries those', async () => {
        adminConfig.media.fields = [credit];
        uploadMedia
            .mockResolvedValueOnce({ id: 'm1' })
            .mockRejectedValueOnce(new Error('Storage is full'));

        const user = renderPicker();
        await pickFiles(user, ['a.png', 'b.png', 'c.png']);
        const dialog = await screen.findByRole('dialog', { name: 'Upload 3 files' });
        await user.type(within(dialog).getByLabelText(/Credit/), 'Ann');
        const listReads = mediaQuery.mock.calls.length;
        await user.click(within(dialog).getByRole('button', { name: 'Upload' }));

        expect(await screen.findByText('Uploaded 1 of 3 files.')).toBeDefined();
        await screen.findByRole('dialog', { name: 'Upload 2 files' });
        // The file that landed shows in the library although the batch failed.
        await waitFor(() =>
            expect(mediaQuery.mock.calls.length).toBeGreaterThan(listReads)
        );

        await user.click(screen.getByRole('button', { name: 'Upload' }));

        await waitFor(() =>
            expect(uploadedNames()).toEqual(['a.png', 'b.png', 'b.png', 'c.png'])
        );
        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: 'Upload 2 files' })).toBeNull()
        );
    });

    it('opens the dialog on a 422 from a direct upload, with only the files left', async () => {
        // A default passes the browser's check; the server's own rule refuses it.
        adminConfig.media.fields = [{ ...credit, defaultValue: 'Staff' }];
        uploadMedia
            .mockResolvedValueOnce({ id: 'm1' })
            .mockRejectedValueOnce(
                unprocessable({ credit: ['Credit must name a person'] })
            );

        const user = renderPicker();
        await pickFiles(user, ['a.png', 'b.png']);

        const dialog = await screen.findByRole('dialog', { name: 'Upload 1 file' });
        expect(within(dialog).getByText('Credit must name a person')).toBeDefined();
        await user.type(within(dialog).getByLabelText(/Credit/), 'Ann Lee');
        await user.click(within(dialog).getByRole('button', { name: 'Upload' }));

        await waitFor(() => expect(uploadedNames()).toEqual(['a.png', 'b.png', 'b.png']));
        expect(uploadMedia).toHaveBeenLastCalledWith({
            file: expect.any(File),
            data: { fields: { credit: 'Ann Lee' } },
        });
    });

    it('cannot be cancelled or dismissed while the upload runs', async () => {
        adminConfig.media.fields = [credit];
        let finish: (media: { id: string }) => void = () => undefined;
        uploadMedia.mockReturnValue(
            new Promise((resolve) => {
                finish = resolve;
            })
        );

        const user = await uploadPhoto();
        const dialog = await fillCreditAndUpload(user);

        await waitFor(() =>
            expect(
                within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Cancel' })
                    .disabled
            ).toBe(true)
        );
        await user.keyboard('{Escape}');
        expect(screen.getByRole('dialog', { name: 'Upload 1 file' })).toBe(dialog);

        finish({ id: 'm1' });
        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: 'Upload 1 file' })).toBeNull()
        );
    });

    it('leaves Cmd+S in the dialog to the dialog, not the page form behind it', async () => {
        adminConfig.media.fields = [credit];
        const savePage = vi.fn(async () => ({}));

        const user = renderPicker(<PageForm onSubmit={savePage} />);
        await screen.findAllByRole('button', { name: /Upload/ });
        await user.keyboard('{Control>}s{/Control}{Meta>}s{/Meta}');
        // The page form saves on Cmd+S while nothing covers it.
        await waitFor(() => expect(savePage).toHaveBeenCalledOnce());

        await pickFiles(user, ['photo.png']);
        const dialog = await screen.findByRole('dialog', { name: 'Upload 1 file' });
        await user.type(within(dialog).getByLabelText(/Credit/), 'Ann');
        within(dialog).getByRole('button', { name: 'Cancel' }).focus();
        await user.keyboard('{Control>}s{/Control}{Meta>}s{/Meta}');

        expect(savePage).toHaveBeenCalledOnce();
        expect(uploadMedia).not.toHaveBeenCalled();
    });
});

/** A page's main form, with the Cmd+S save every edit page has. */
function PageForm({
    onSubmit,
}: {
    onSubmit: () => Promise<unknown>;
}): React.ReactElement {
    useFieldsForm({ fieldDefinitions: [], operation: 'update', onSubmit });
    return <></>;
}
