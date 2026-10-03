/**
 * @vitest-environment happy-dom
 *
 * The Save button read `form.state.isDirty` — a plain getter that never
 * re-renders — so it stayed disabled and no media edit could ever be saved.
 * Closing the modal or switching its locale with unsaved edits asks first.
 */

import type { RenderAdminResult } from '../../_support/render-admin';
import type { MediaDetailModalProps } from '@/admin/components/media/media-detail-modal';
import type { Media } from '@/types/index';
import type { UserEvent } from '@testing-library/user-event';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaDetailModal } from '@/admin/components/media/media-detail-modal';
import { renderAdmin } from '../../_support/render-admin';

const { media, adminConfig } = vi.hoisted(() => ({
    media: {
        get: vi.fn(),
        usedBy: vi.fn(),
        versions: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en', 'fr'],
        media: { translatable: false },
    },
}));

// The shim declares one locale and no translation; the switcher needs both.
vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

/** The locale `useMediaItem` was asked for, so a fallback read can be faked. */
const requestedLocale = { current: undefined as string | undefined };

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

// The modal reads and writes the item through the client; everything else is real.
vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: { ...real.astromechUntypedClient, media },
    };
});

afterEach(() => {
    for (const fn of Object.values(media)) fn.mockReset();
    requestedLocale.current = undefined;
    adminConfig.media.translatable = false;
});

/** The library as the media page renders it: `?item=` opens the modal, closing drops it. */
function Library(
    permissions: Pick<MediaDetailModalProps, 'canUpdate' | 'canDelete'>
): React.ReactElement {
    const navigate = useNavigate();
    const search = useSearch({ strict: false }) as { item?: string };
    return (
        <MediaDetailModal
            mediaId={search.item ?? null}
            onClose={() => void navigate({ to: '/media', replace: true })}
            onDeleted={() =>
                void navigate({ to: '/media', replace: true, ignoreBlocker: true })
            }
            {...permissions}
        />
    );
}

/**
 * Open the modal on the fixed item with the permission flags under test, once
 * the item has loaded.
 */
async function openModal(permissions?: {
    canUpdate?: boolean;
    canDelete?: boolean;
}): Promise<UserEvent> {
    return (await openLibrary(permissions)).user;
}

/** `openModal`, returning the page so a test can read where the router went. */
async function openLibrary(
    permissions: { canUpdate?: boolean; canDelete?: boolean } = {}
): Promise<RenderAdminResult> {
    media.get.mockImplementation(async (params: { locale?: string }) => {
        requestedLocale.current = params.locale;
        // The item has an `en` row alone, so every read falls back to it.
        return ITEM;
    });
    media.usedBy.mockResolvedValue([]);
    media.versions.mockResolvedValue([]);
    media.update.mockResolvedValue(ITEM);
    const page = renderAdmin(<Library {...permissions} />, {
        url: `/media?item=${ITEM.id}`,
    });
    await screen.findByText('cat.png');
    return page;
}

/** The Save button, which only exists when the viewer may update. */
function saveButton(): HTMLButtonElement {
    return screen.getByRole('button', { name: 'Update' }) as HTMLButtonElement;
}

describe('MediaDetailModal save gate', () => {
    it('starts disabled while the form is untouched', async () => {
        await openModal();

        expect(saveButton().disabled).toBe(true);
    });

    it('enables once a field changes', async () => {
        const user = await openModal();

        await user.type(screen.getByLabelText('Alt text'), 'A cat');

        expect(saveButton().disabled).toBe(false);
    });

    it('submits alt, title and caption together', async () => {
        const user = await openModal();

        await user.type(screen.getByLabelText('Alt text'), 'A cat');
        await user.type(screen.getByLabelText('Title'), 'Cat photo');
        await user.type(screen.getByLabelText('Caption'), 'Sitting on a mat');
        await user.click(saveButton());

        await waitFor(() => {
            expect(media.update).toHaveBeenCalledWith({
                id: 'm1',
                locale: undefined,
                data: { alt: 'A cat', title: 'Cat photo', caption: 'Sitting on a mat' },
            });
        });
    });
});

describe('MediaDetailModal permissions', () => {
    it('renders no Save button without update permission', async () => {
        await openModal({ canUpdate: false });

        expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
    });

    it('still renders Delete without update permission', async () => {
        await openModal({ canUpdate: false, canDelete: true });

        expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeNull();
    });

    it('renders no Delete button without delete permission', async () => {
        await openModal({ canDelete: false });

        expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Update' })).not.toBeNull();
    });
});

/** Open the modal's locale listbox and pick the option with this label. */
async function pickLocale(user: UserEvent, label: string): Promise<void> {
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: label }));
}

describe('MediaDetailModal locales', () => {
    it('renders no locale select when media is not translatable', async () => {
        await openModal();

        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('offers every configured locale when media is translatable', async () => {
        adminConfig.media.translatable = true;
        const user = await openModal();

        await user.click(screen.getByRole('combobox'));

        expect(
            (await screen.findAllByRole('option')).map((option) => option.textContent)
        ).toEqual(['EN', 'Add FR']);
    });

    it('reads the chosen locale and says the shown content is the fallback', async () => {
        adminConfig.media.translatable = true;
        const user = await openModal();

        await pickLocale(user, 'Add FR');

        expect(
            await screen.findByText('Showing the EN content until this locale is saved.')
        ).not.toBeNull();
        expect(requestedLocale.current).toBe('fr');
    });

    it('saves into the chosen locale', async () => {
        adminConfig.media.translatable = true;
        const user = await openModal();

        await pickLocale(user, 'Add FR');
        await user.type(await screen.findByLabelText('Alt text'), 'Un chat');
        await user.click(saveButton());

        await waitFor(() => {
            expect(media.update).toHaveBeenCalledWith({
                id: 'm1',
                locale: 'fr',
                data: { alt: 'Un chat', title: '', caption: '' },
            });
        });
    });
});

/** The unsaved-changes dialog, once it is open. */
function discardDialog(): Promise<HTMLElement> {
    return screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' });
}

describe('MediaDetailModal unsaved changes', () => {
    it('asks before closing with unsaved edits, and staying keeps them', async () => {
        const page = await openLibrary();

        await page.user.type(screen.getByLabelText('Alt text'), 'A cat');
        await page.user.click(screen.getByRole('button', { name: 'Cancel' }));
        const dialog = await discardDialog();
        await page.user.click(
            within(dialog).getByRole('button', { name: 'Keep editing' })
        );

        await waitFor(() => expect(dialog.isConnected).toBe(false));
        expect(page.location()).toBe(`/media?item=${ITEM.id}`);
        expect((screen.getByLabelText('Alt text') as HTMLInputElement).value).toBe(
            'A cat'
        );
    });

    it('closes once the editor discards the edits', async () => {
        const page = await openLibrary();

        await page.user.type(screen.getByLabelText('Alt text'), 'A cat');
        await page.user.click(screen.getByRole('button', { name: 'Cancel' }));
        const dialog = await discardDialog();
        await page.user.click(
            within(dialog).getByRole('button', { name: 'Discard changes' })
        );

        await waitFor(() => expect(page.location()).toBe('/media'));
        expect(media.update).not.toHaveBeenCalled();
    });

    it('closes without asking when nothing changed', async () => {
        const page = await openLibrary();

        await page.user.click(screen.getByRole('button', { name: 'Cancel' }));

        await waitFor(() => expect(page.location()).toBe('/media'));
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('asks before a locale switch drops unsaved edits', async () => {
        adminConfig.media.translatable = true;
        const page = await openLibrary();

        await page.user.type(screen.getByLabelText('Alt text'), 'A cat');
        await pickLocale(page.user, 'Add FR');
        const dialog = await discardDialog();
        await page.user.click(
            within(dialog).getByRole('button', { name: 'Keep editing' })
        );

        await waitFor(() => expect(dialog.isConnected).toBe(false));
        expect(requestedLocale.current).toBe('en');
        expect((screen.getByLabelText('Alt text') as HTMLInputElement).value).toBe(
            'A cat'
        );
    });
});
