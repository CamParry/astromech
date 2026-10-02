/**
 * @vitest-environment happy-dom
 *
 * The media modal's versions list: newest first, restore behind a confirm,
 * and no restore action at all for a viewer who may not update.
 */

import type { VersionMetadata } from '@/types/index';
import type { UserEvent } from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaVersionsPanel } from '@/admin/components/media/media-versions-panel';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import { createTestQueryClient, renderWithProviders } from '../../_support/render-admin';

const { media } = vi.hoisted(() => ({
    media: { versions: vi.fn(), restoreVersion: vi.fn() },
}));

// The panel restores through the client; everything else is real.
vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: { ...real.astromechUntypedClient, media },
    };
});

function makeVersion(version: number): VersionMetadata {
    return {
        locale: 'en',
        version,
        createdAt: new Date(`2026-01-0${version}T00:00:00Z`),
        createdBy: null,
    };
}

afterEach(() => {
    for (const fn of Object.values(media)) fn.mockReset();
});

/** Render the panel over `versions`, seeded as the locale's version list. */
function renderPanel(versions: VersionMetadata[], canUpdate = true): UserEvent {
    media.versions.mockResolvedValue(versions);
    media.restoreVersion.mockResolvedValue(null);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.media.versions('m1', 'en'), versions);
    const { user } = renderWithProviders(
        <MediaVersionsPanel mediaId="m1" locale="en" canUpdate={canUpdate} />,
        { queryClient }
    );
    return user;
}

describe('MediaVersionsPanel', () => {
    it('says so when the locale has no versions', () => {
        renderPanel([]);

        expect(screen.getByText('No versions recorded yet.')).not.toBeNull();
    });

    it('lists the versions newest first whatever order they arrive in', () => {
        renderPanel([makeVersion(1), makeVersion(3), makeVersion(2)]);

        expect(screen.getAllByText(/^v\d+$/).map((el) => el.textContent)).toEqual([
            'v3',
            'v2',
            'v1',
        ]);
    });

    it('restores the version whose row was clicked, once confirmed', async () => {
        const user = renderPanel([makeVersion(1), makeVersion(2)]);

        const buttons = screen.getAllByRole('button', { name: 'Restore this version' });
        // The list is newest first, so the second row is version 1.
        await user.click(buttons[1] as HTMLElement);
        const dialog = await screen.findByRole('alertdialog');
        await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

        await waitFor(() => {
            expect(media.restoreVersion).toHaveBeenCalledWith({
                id: 'm1',
                locale: 'en',
                version: 1,
            });
        });
    });

    it('renders no restore action without update permission', () => {
        renderPanel([makeVersion(1)], false);

        expect(screen.queryByRole('button', { name: 'Restore this version' })).toBeNull();
    });
});
