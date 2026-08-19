/**
 * @vitest-environment happy-dom
 *
 * Replacing a file keeps the media item's id and URL, so every entry pointing
 * at it silently starts serving different bytes. The confirm has to say how
 * many that is, and it can only be raised once a file has been chosen.
 */

import type { Media, MediaUsage } from '@/types/index';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaDetailModal } from '@/admin/components/media/MediaDetailModal';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import en from '@/admin/locales/en.json';

const { replaceMutate } = vi.hoisted(() => ({ replaceMutate: vi.fn() }));

const ITEM: Media = {
    id: 'm1',
    filename: 'cat.png',
    mimeType: 'image/png',
    size: 2048,
    url: '/media/cat.png',
    alt: '',
    title: '',
    caption: '',
    fields: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: null,
};

/**
 * Two edges, so the confirm's count is neither zero nor the singular form.
 * User sources, so the usage panel needs no entry-type labels from the
 * admin-config shim to render them.
 */
let usage: MediaUsage[] = [];

const USAGE = [
    {
        sourceId: 'u1',
        sourceKind: 'user',
        sourceType: null,
        sourceTitle: 'Ada',
        schemaPath: 'avatar',
        instancePath: 'avatar',
        sourceStaged: false,
    },
    {
        sourceId: 'u2',
        sourceKind: 'user',
        sourceType: null,
        sourceTitle: 'Grace',
        schemaPath: 'avatar',
        instancePath: 'avatar',
        sourceStaged: false,
    },
] as MediaUsage[];

vi.mock('@/admin/hooks/media', () => ({
    useMediaItem: () => ({ data: ITEM, isLoading: false, isError: false }),
    useUpdateMedia: () => ({ mutate: vi.fn(), isPending: false }),
    useDeleteMedia: () => ({ mutate: vi.fn(), isPending: false }),
    useReplaceMedia: () => ({ mutate: replaceMutate, isPending: false }),
    useMediaUsage: () => ({ data: usage, isLoading: false }),
}));

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
});

beforeEach(() => {
    usage = USAGE;
});

afterEach(() => {
    cleanup();
    replaceMutate.mockReset();
});

/** Open the modal on the fixed item with the permission flags under test. */
function openModal(permissions?: { canUpload?: boolean }): void {
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

/** The picker behind the Replace button — hidden, so it is not queryable by role. */
function fileInput(): HTMLInputElement {
    const input = document.querySelector('input[type="file"]');
    if (input === null) throw new Error('no file input rendered');
    return input as HTMLInputElement;
}

const NEW_FILE = new File(['bytes'], 'kitten.jpg', { type: 'image/jpeg' });

describe('MediaDetailModal replace', () => {
    it('renders no Replace button without upload permission', () => {
        openModal({ canUpload: false });

        expect(screen.queryByRole('button', { name: 'Replace file' })).toBeNull();
        expect(document.querySelector('input[type="file"]')).toBeNull();
    });

    it('renders the Replace button by default', () => {
        openModal();

        expect(screen.queryByRole('button', { name: 'Replace file' })).not.toBeNull();
    });

    it('accepts any file of the item’s own media family', () => {
        openModal();

        expect(fileInput().accept).toBe('image/*');
    });

    it('raises no confirm until a file has been chosen', () => {
        openModal();

        expect(screen.queryByText('Replace this file?')).toBeNull();
    });

    it('names the chosen file and the reference count in the confirm', async () => {
        const user = userEvent.setup();
        openModal();

        await user.upload(fileInput(), NEW_FILE);

        expect(screen.queryByText('Replace this file?')).not.toBeNull();
        const description = screen.getByText(/will replace the current file/);
        expect(description.textContent).toContain('kitten.jpg');
        expect(description.textContent).toContain('2 references to this file');
    });

    // i18next only reaches a `_zero` key when one is declared; without it an
    // unreferenced file reads "0 references to this file".
    it('says no references when nothing points at the file', async () => {
        usage = [];
        const user = userEvent.setup();
        openModal();

        await user.upload(fileInput(), NEW_FILE);

        const description = screen.getByText(/will replace the current file/);
        expect(description.textContent).toContain('No references to this file');
        expect(description.textContent).not.toContain('0 references');
    });

    it('replaces with the chosen file once confirmed', async () => {
        const user = userEvent.setup();
        openModal();

        await user.upload(fileInput(), NEW_FILE);
        await user.click(screen.getByRole('button', { name: 'Replace' }));

        expect(replaceMutate).toHaveBeenCalledWith(NEW_FILE);
    });

    it('does not replace while the confirm is still open', async () => {
        const user = userEvent.setup();
        openModal();

        await user.upload(fileInput(), NEW_FILE);

        expect(replaceMutate).not.toHaveBeenCalled();
    });
});
