/**
 * @vitest-environment happy-dom
 *
 * Replacing a file keeps the media item's id and URL, so every entry pointing
 * at it silently starts serving different bytes. The confirm has to say how
 * many that is, and it can only be raised once a file has been chosen.
 */

import type { Media, Usage } from '@/types/index';
import type { UserEvent } from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaDetailModal } from '@/admin/components/media/media-detail-modal';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import { createTestQueryClient, renderAdmin } from '../../_support/render-admin';

const { media } = vi.hoisted(() => ({
    media: { get: vi.fn(), versions: vi.fn(), replace: vi.fn() },
}));

// The modal reads and writes the item through the client; everything else is real.
vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: { ...real.astromechUntypedClient, media },
    };
});

const ITEM: Media = {
    id: 'm1',
    filename: 'cat.png',
    mimeType: 'image/png',
    size: 2048,
    url: '/media/cat.png',
    width: null,
    height: null,
    metadata: null,
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

/**
 * Two references, so the confirm's count is neither zero nor the singular form.
 * User sources, so the usage panel needs no entry-type labels from the
 * admin-config shim to render them.
 */
let usage: Usage[] = [];

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
] as Usage[];

beforeEach(() => {
    usage = USAGE;
});

afterEach(() => {
    for (const fn of Object.values(media)) fn.mockReset();
});

/**
 * Open the modal on the fixed item with the permission flags under test, once
 * the item has loaded. Its usage is seeded, so the confirm's count is known
 * from the first render.
 */
async function openModal(permissions?: { canUpload?: boolean }): Promise<UserEvent> {
    media.get.mockResolvedValue(ITEM);
    media.versions.mockResolvedValue([]);
    media.replace.mockResolvedValue(ITEM);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.media.usedBy(ITEM.id), usage);
    const { user } = renderAdmin(
        <MediaDetailModal
            mediaId={ITEM.id}
            onClose={vi.fn()}
            onDeleted={vi.fn()}
            {...permissions}
        />,
        { queryClient }
    );
    await screen.findByText('cat.png');
    return user;
}

/** The picker behind the Replace button — hidden, so it is not queryable by role. */
function fileInput(): HTMLInputElement {
    const input = document.querySelector('input[type="file"]');
    if (input === null) throw new Error('no file input rendered');
    return input as HTMLInputElement;
}

const NEW_FILE = new File(['bytes'], 'kitten.jpg', { type: 'image/jpeg' });

describe('MediaDetailModal replace', () => {
    it('renders no Replace button without upload permission', async () => {
        await openModal({ canUpload: false });

        expect(screen.queryByRole('button', { name: 'Replace file' })).toBeNull();
        expect(document.querySelector('input[type="file"]')).toBeNull();
    });

    it('renders the Replace button by default', async () => {
        await openModal();

        expect(screen.queryByRole('button', { name: 'Replace file' })).not.toBeNull();
    });

    it('accepts any file of the item’s own media family', async () => {
        await openModal();

        expect(fileInput().accept).toBe('image/*');
    });

    it('raises no confirm until a file has been chosen', async () => {
        await openModal();

        expect(screen.queryByText('Replace this file?')).toBeNull();
    });

    it('names the chosen file and the reference count in the confirm', async () => {
        const user = await openModal();

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
        const user = await openModal();

        await user.upload(fileInput(), NEW_FILE);

        const description = screen.getByText(/will replace the current file/);
        expect(description.textContent).toContain('No references to this file');
        expect(description.textContent).not.toContain('0 references');
    });

    it('replaces with the chosen file once confirmed', async () => {
        const user = await openModal();

        await user.upload(fileInput(), NEW_FILE);
        await user.click(screen.getByRole('button', { name: 'Replace' }));

        await waitFor(() => {
            expect(media.replace).toHaveBeenCalledWith({ id: 'm1', file: NEW_FILE });
        });
    });

    it('does not replace while the confirm is still open', async () => {
        const user = await openModal();

        await user.upload(fileInput(), NEW_FILE);

        expect(media.replace).not.toHaveBeenCalled();
    });
});
