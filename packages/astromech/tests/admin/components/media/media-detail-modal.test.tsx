/**
 * @vitest-environment happy-dom
 *
 * The Save button read `form.state.isDirty` — a plain getter that never
 * re-renders — so it stayed disabled and no media edit could ever be saved.
 */

import type { Media } from '@/types/index';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MediaDetailModal } from '@/admin/components/media/media-detail-modal';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import en from '@/admin/locales/en.json';

const { updateMutate, deleteMutate } = vi.hoisted(() => ({
    updateMutate: vi.fn(),
    deleteMutate: vi.fn(),
}));

const ITEM: Media = {
    id: 'm1',
    filename: 'cat.png',
    mimeType: 'image/png',
    size: 2048,
    url: '/media/cat.png',
    alt: '',
    title: '',
    caption: '',
    fields: {},
    locale: 'en',
    locales: ['en'],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: null,
    updatedBy: null,
};

// The usage panel queries too, so the whole hooks module is stood in for.
vi.mock('@/admin/hooks/media', () => ({
    useMediaItem: () => ({ data: ITEM, isLoading: false, isError: false }),
    useUpdateMedia: () => ({ mutate: updateMutate, isPending: false }),
    useDeleteMedia: () => ({ mutate: deleteMutate, isPending: false }),
    useReplaceMedia: () => ({ mutate: vi.fn(), isPending: false }),
    useMediaUsage: () => ({ data: [], isLoading: false }),
}));

beforeAll(async () => {
    // Buttons and inputs are found by their labels, so real strings are needed;
    // the SPA's own i18n module pulls in virtual modules, so stand up a bare one.
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
});

afterEach(() => {
    cleanup();
    updateMutate.mockReset();
    deleteMutate.mockReset();
});

/** Open the modal on the fixed item with the permission flags under test. */
function openModal(permissions?: { canUpdate?: boolean; canDelete?: boolean }): void {
    render(
        <ConfirmProvider>
            <MediaDetailModal
                mediaId={ITEM.id}
                onClose={vi.fn()}
                onDeleted={vi.fn()}
                {...permissions}
            />
        </ConfirmProvider>
    );
}

/** The Save button, which only exists when the viewer may update. */
function saveButton(): HTMLButtonElement {
    return screen.getByRole('button', { name: 'Update' }) as HTMLButtonElement;
}

describe('MediaDetailModal save gate', () => {
    it('starts disabled while the form is untouched', () => {
        openModal();

        expect(saveButton().disabled).toBe(true);
    });

    it('enables once a field changes', async () => {
        const user = userEvent.setup();
        openModal();

        await user.type(screen.getByLabelText('Alt text'), 'A cat');

        expect(saveButton().disabled).toBe(false);
    });

    it('submits alt, title and caption together', async () => {
        const user = userEvent.setup();
        openModal();

        await user.type(screen.getByLabelText('Alt text'), 'A cat');
        await user.type(screen.getByLabelText('Title'), 'Cat photo');
        await user.type(screen.getByLabelText('Caption'), 'Sitting on a mat');
        await user.click(saveButton());

        expect(updateMutate).toHaveBeenCalledWith({
            alt: 'A cat',
            title: 'Cat photo',
            caption: 'Sitting on a mat',
        });
    });
});

describe('MediaDetailModal permissions', () => {
    it('renders no Save button without update permission', () => {
        openModal({ canUpdate: false });

        expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
    });

    it('still renders Delete without update permission', () => {
        openModal({ canUpdate: false, canDelete: true });

        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeNull();
    });

    it('renders no Delete button without delete permission', () => {
        openModal({ canDelete: false });

        expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Update' })).not.toBeNull();
    });
});
