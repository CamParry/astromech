/**
 * @vitest-environment happy-dom
 *
 * The shell's `?` shortcut opens the keyboard shortcuts dialog, except while a
 * modal dialog covers the page.
 */

import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/admin/components/layout/app-shell';
import { Modal } from '@/admin/components/ui/modal';
import { renderAdmin } from '../../_support/render-admin';

vi.mock('virtual:astromech/admin-config', () => ({
    default: {
        defaultLocale: 'en',
        locales: ['en'],
        entryTypes: {},
        globals: {},
        pages: [],
        plugins: [],
    },
}));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: {
            ...real.astromechUntypedClient,
            notifications: {
                count: vi.fn(async () => ({ count: 0 })),
                list: vi.fn(async () => ({ data: [] })),
            },
        },
    };
});

/** `?` as a keyboard types it, with Shift held. */
const QUESTION_MARK = '{Shift>}?{/Shift}';

describe('the shortcuts hotkey', () => {
    it('opens the shortcuts dialog', async () => {
        const { user } = renderAdmin(<AppShell />);

        await screen.findByRole('main');
        await user.keyboard(QUESTION_MARK);

        expect(
            await screen.findByRole('dialog', { name: 'Keyboard Shortcuts' })
        ).toBeDefined();
    });

    it('does not open over a modal dialog', async () => {
        const { user } = renderAdmin(
            <>
                <AppShell />
                <Modal open onClose={vi.fn()} title="Pick a page">
                    <button type="button">Inside</button>
                </Modal>
            </>
        );

        (await screen.findByRole('button', { name: 'Inside' })).focus();
        await user.keyboard(QUESTION_MARK);

        expect(screen.queryByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeNull();
    });
});
