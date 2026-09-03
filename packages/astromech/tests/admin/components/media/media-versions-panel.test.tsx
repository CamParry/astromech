/**
 * @vitest-environment happy-dom
 *
 * The media modal's versions list: newest first, restore behind a confirm,
 * and no restore action at all for a viewer who may not update.
 */

import type { MediaVersion } from '@/types/index';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MediaVersionsPanel } from '@/admin/components/media/media-versions-panel';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import en from '@/admin/locales/en.json';

const { restoreMutate } = vi.hoisted(() => ({ restoreMutate: vi.fn() }));

let versions: MediaVersion[] = [];

vi.mock('@/admin/hooks/media', () => ({
    useMediaVersions: () => ({ data: versions, isLoading: false }),
    useRestoreMediaVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

function makeVersion(version: number, id: string): MediaVersion {
    return {
        id,
        mediaId: 'm1',
        locale: 'en',
        version,
        title: `Title ${version}`,
        alt: null,
        caption: null,
        fields: {},
        createdAt: new Date(`2026-01-0${version}T00:00:00Z`),
        createdBy: null,
    };
}

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
});

afterEach(() => {
    cleanup();
    restoreMutate.mockReset();
    versions = [];
});

function renderPanel(canUpdate = true): void {
    render(
        <ConfirmProvider>
            <MediaVersionsPanel mediaId="m1" locale="en" canUpdate={canUpdate} />
        </ConfirmProvider>
    );
}

describe('MediaVersionsPanel', () => {
    it('says so when the locale has no versions', () => {
        renderPanel();

        expect(screen.getByText('No versions recorded yet.')).not.toBeNull();
    });

    it('lists the versions newest first whatever order they arrive in', () => {
        versions = [makeVersion(1, 'v1'), makeVersion(3, 'v3'), makeVersion(2, 'v2')];
        renderPanel();

        expect(
            [...document.querySelectorAll('.am-media-versions-number')].map(
                (el) => el.textContent
            )
        ).toEqual(['v3', 'v2', 'v1']);
    });

    it('restores the version whose row was clicked, once confirmed', async () => {
        const user = userEvent.setup();
        versions = [makeVersion(1, 'v1'), makeVersion(2, 'v2')];
        renderPanel();

        const buttons = screen.getAllByRole('button', { name: 'Restore this version' });
        // The list is newest first, so the second row is version 1.
        await user.click(buttons[1] as HTMLElement);
        await user.click(screen.getByRole('button', { name: 'Restore' }));

        expect(restoreMutate).toHaveBeenCalledWith('v1');
    });

    it('renders no restore action without update permission', () => {
        versions = [makeVersion(1, 'v1')];
        renderPanel(false);

        expect(screen.queryByRole('button', { name: 'Restore this version' })).toBeNull();
    });
});
