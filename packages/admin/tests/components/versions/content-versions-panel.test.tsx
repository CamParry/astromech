/**
 * @vitest-environment happy-dom
 *
 * The shared versions list: newest first, restore behind a confirm, and no
 * restore action at all for a viewer who may not update. A failed read shows
 * an error rather than an empty history.
 */
import type { VersionListItem } from '@/admin/components/versions/content-versions-panel';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import { ContentVersionsPanel } from '@/admin/components/versions/content-versions-panel';

function makeVersion(version: number): VersionListItem {
    return {
        version,
        createdAt: new Date(`2026-01-0${version}T00:00:00Z`),
    };
}

function renderPanel(
    versions: VersionListItem[],
    {
        canUpdate = true,
        isError = false,
        onRestore = vi.fn(),
    }: {
        canUpdate?: boolean;
        isError?: boolean;
        onRestore?: (version: number) => void;
    } = {}
): { onRestore: (version: number) => void } {
    render(
        <ConfirmProvider>
            <ContentVersionsPanel
                versions={versions}
                isLoading={false}
                isError={isError}
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

    it('shows an error, not the empty state, when the read failed', () => {
        renderPanel([], { isError: true });

        expect(screen.getByText('The versions could not be loaded.')).not.toBeNull();
        expect(screen.queryByText('No versions recorded yet.')).toBeNull();
    });

    it('keeps a list already read when a later read fails', () => {
        renderPanel([makeVersion(1)], { isError: true });

        expect(document.querySelectorAll('.am-content-versions-number')).toHaveLength(1);
        expect(screen.queryByText('The versions could not be loaded.')).toBeNull();
    });

    it('lists the versions newest first whatever order they arrive in', () => {
        renderPanel([makeVersion(1), makeVersion(3), makeVersion(2)]);

        expect(
            [...document.querySelectorAll('.am-content-versions-number')].map(
                (el) => el.textContent
            )
        ).toEqual(['v3', 'v2', 'v1']);
    });

    it('restores the version whose row was clicked, once confirmed', async () => {
        const user = userEvent.setup();
        const onRestore = vi.fn();
        renderPanel([makeVersion(1), makeVersion(2)], { onRestore });

        const buttons = screen.getAllByRole('button', { name: 'Restore this version' });
        // The list is newest first, so the second row is version 1.
        await user.click(buttons[1] as HTMLElement);
        await user.click(screen.getByRole('button', { name: 'Restore' }));

        expect(onRestore).toHaveBeenCalledWith(1);
    });

    it('renders no restore action without update permission', () => {
        renderPanel([makeVersion(1)], { canUpdate: false });

        expect(screen.queryByRole('button', { name: 'Restore this version' })).toBeNull();
    });
});
