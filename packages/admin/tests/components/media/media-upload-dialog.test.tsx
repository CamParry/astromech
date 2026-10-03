/**
 * @vitest-environment happy-dom
 *
 * An upload asks for the media fields only when a required one has no default:
 * the dialog sends what the author fills in as each file's `data.fields`, and
 * a 422 lands on the field it names while the dialog stays open.
 */

import type { UserEvent } from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaPicker } from '@/admin/components/media/media-picker';
import { AstromechApiError } from '@/transport/http/client';
import { renderWithProviders } from '../../_support/render-admin';

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

/** Render the picker for a viewer who may upload, and pick one file. */
async function uploadPhoto(): Promise<UserEvent> {
    const { user } = renderWithProviders(
        <MediaPicker
            query={{ q: '', type: 'all', page: 1 }}
            onQueryChange={vi.fn()}
            selectedIds={[]}
            onPick={vi.fn()}
            multiple={false}
        />,
        { permissions: ['media:read', 'media:upload'] }
    );
    await screen.findAllByRole('button', { name: /Upload/ });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) throw new Error('the picker renders no file input');
    await user.upload(input, new File(['bytes'], 'photo.png', { type: 'image/png' }));
    return user;
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
        uploadMedia.mockRejectedValue(
            new AstromechApiError({
                id: 'e1',
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                status: 422,
                details: { fields: { credit: ['Credit is too short'] } },
            })
        );

        const user = await uploadPhoto();
        const dialog = await fillCreditAndUpload(user);

        expect(await within(dialog).findByText('Credit is too short')).toBeDefined();
        expect(screen.getByRole('dialog', { name: 'Upload 1 file' })).toBe(dialog);
    });
});
