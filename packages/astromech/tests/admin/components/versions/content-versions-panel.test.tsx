/**
 * @vitest-environment happy-dom
 *
 * The shared versions list: newest first, restore behind a confirm, and no
 * restore action at all for a viewer who may not update.
 */
import type { VersionListItem } from '@/admin/components/versions/content-versions-panel';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import { ContentVersionsPanel } from '@/admin/components/versions/content-versions-panel';
import en from '@/admin/locales/en.json';

function makeVersion(version: number, id: string): VersionListItem {
    return {
        id,
        version,
        createdAt: new Date(`2026-01-0${version}T00:00:00Z`),
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
});

function renderPanel(
    versions: VersionListItem[],
    {
        canUpdate = true,
        onRestore = vi.fn(),
    }: { canUpdate?: boolean; onRestore?: (id: string) => void } = {}
): { onRestore: (id: string) => void } {
    render(
        <ConfirmProvider>
            <ContentVersionsPanel
                versions={versions}
                isLoading={false}
                canUpdate={canUpdate}
                onRestore={onRestore}
                isRestoring={false}
            />
        </ConfirmProvider>
    );
    return { onRestore };
}

describe('ContentVersionsPanel', () => {
    it('says so when there are no versions', () => {
        renderPanel([]);

        expect(screen.getByText('No versions recorded yet.')).not.toBeNull();
    });

    it('lists the versions newest first whatever order they arrive in', () => {
        renderPanel([makeVersion(1, 'v1'), makeVersion(3, 'v3'), makeVersion(2, 'v2')]);

        expect(
            [...document.querySelectorAll('.am-content-versions-number')].map(
                (el) => el.textContent
            )
        ).toEqual(['v3', 'v2', 'v1']);
    });

    it('restores the version whose row was clicked, once confirmed', async () => {
        const user = userEvent.setup();
        const onRestore = vi.fn();
        renderPanel([makeVersion(1, 'v1'), makeVersion(2, 'v2')], { onRestore });

        const buttons = screen.getAllByRole('button', { name: 'Restore this version' });
        // The list is newest first, so the second row is version 1.
        await user.click(buttons[1] as HTMLElement);
        await user.click(screen.getByRole('button', { name: 'Restore' }));

        expect(onRestore).toHaveBeenCalledWith('v1');
    });

    it('renders no restore action without update permission', () => {
        renderPanel([makeVersion(1, 'v1')], { canUpdate: false });

        expect(screen.queryByRole('button', { name: 'Restore this version' })).toBeNull();
    });
});
