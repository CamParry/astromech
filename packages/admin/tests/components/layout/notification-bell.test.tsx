/**
 * @vitest-environment happy-dom
 *
 * The topbar's notification bell: the badge shows the server's unread count,
 * opening the panel lists the notifications, dismissing one or all tells the
 * server and refreshes the count, and an empty list says so.
 */

import type { Notification } from '@/types/index';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from '@/admin/components/layout/notification-bell';
import { renderAdmin } from '../../_support/render-admin';

const { count, list, dismiss, dismissAll } = vi.hoisted(() => ({
    count: vi.fn(),
    list: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
}));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: {
            ...real.astromechUntypedClient,
            notifications: { count, list, dismiss, dismissAll },
        },
    };
});

function makeNotification(
    id: string,
    title: string,
    href: string | null = null
): Notification {
    return {
        id,
        userId: 'u1',
        type: 'info',
        title,
        message: `${title} message`,
        href,
        createdAt: new Date().toISOString(),
    };
}

beforeEach(() => {
    // A linked row strips this base path, a define Vite sets for the admin.
    vi.stubGlobal('__ASTROMECH_BASE_PATH__', '/cms');
});

afterEach(() => {
    vi.unstubAllGlobals();
    count.mockReset();
    list.mockReset();
    dismiss.mockReset();
    dismissAll.mockReset();
});

/** The bell, whose name carries the unread count when there is one. */
function bell(): HTMLElement {
    return screen.getByRole('button', { name: /^Notifications/ });
}

async function openPanel(view: ReturnType<typeof renderAdmin>): Promise<HTMLElement> {
    await view.user.click(await screen.findByRole('button', { name: /^Notifications/ }));
    return screen.findByRole('menu');
}

describe('the notification bell', () => {
    it('names the unread count for a screen reader', async () => {
        count.mockResolvedValue(12);
        renderAdmin(<NotificationBell />);

        expect(
            await screen.findByRole('button', { name: 'Notifications, 12 unread' })
        ).toBeDefined();
    });

    it('shows the unread count from the server', async () => {
        count.mockResolvedValue(3);
        renderAdmin(<NotificationBell />);

        await waitFor(() => {
            expect(bell().textContent).toBe('3');
        });
    });

    it('caps the badge at 9+', async () => {
        count.mockResolvedValue(12);
        renderAdmin(<NotificationBell />);

        await waitFor(() => {
            expect(bell().textContent).toBe('9+');
        });
    });

    it('lists the notifications when opened', async () => {
        count.mockResolvedValue(2);
        list.mockResolvedValue([
            makeNotification('n1', 'Post published'),
            makeNotification('n2', 'Import finished'),
        ]);
        const view = renderAdmin(<NotificationBell />);

        const panel = await openPanel(view);

        expect(await within(panel).findByText('Post published')).toBeDefined();
        expect(within(panel).getByText('Import finished message')).toBeDefined();
        expect(within(panel).getAllByRole('button', { name: 'Dismiss' })).toHaveLength(2);
    });

    it('says so when there are no notifications', async () => {
        count.mockResolvedValue(0);
        list.mockResolvedValue([]);
        const view = renderAdmin(<NotificationBell />);

        const panel = await openPanel(view);

        expect(await within(panel).findByText('No notifications')).toBeDefined();
        expect(
            within(panel)
                .getByRole('button', { name: 'Dismiss all' })
                .hasAttribute('disabled')
        ).toBe(true);
    });

    it('dismisses one notification and refreshes the count', async () => {
        count.mockResolvedValueOnce(2).mockResolvedValue(1);
        list.mockResolvedValueOnce([
            makeNotification('n1', 'Post published'),
            makeNotification('n2', 'Import finished'),
        ]).mockResolvedValue([makeNotification('n2', 'Import finished')]);
        dismiss.mockResolvedValue(undefined);
        const view = renderAdmin(<NotificationBell />);
        await waitFor(() => {
            expect(bell().textContent).toBe('2');
        });

        const panel = await openPanel(view);
        await within(panel).findByText('Post published');
        // The first row's dismiss button belongs to "Post published".
        const [dismissFirst] = within(panel).getAllByRole('button', { name: 'Dismiss' });
        await view.user.click(dismissFirst!);

        expect(dismiss).toHaveBeenCalledWith({ id: 'n1' });
        await waitFor(() => {
            expect(bell().textContent).toBe('1');
        });
        await waitFor(() => {
            expect(within(panel).queryByText('Post published')).toBeNull();
        });
    });

    it('dismisses all notifications and clears the badge', async () => {
        count.mockResolvedValueOnce(2).mockResolvedValue(0);
        list.mockResolvedValueOnce([
            makeNotification('n1', 'Post published'),
            makeNotification('n2', 'Import finished'),
        ]).mockResolvedValue([]);
        dismissAll.mockResolvedValue(undefined);
        const view = renderAdmin(<NotificationBell />);
        await waitFor(() => {
            expect(bell().textContent).toBe('2');
        });

        const panel = await openPanel(view);
        await within(panel).findByText('Post published');
        await view.user.click(within(panel).getByRole('button', { name: 'Dismiss all' }));

        expect(dismissAll).toHaveBeenCalledTimes(1);
        expect(await screen.findByText('All notifications dismissed.')).toBeDefined();
        await waitFor(() => {
            expect(bell().textContent).toBe('');
        });
        expect(screen.getByRole('button', { name: 'Notifications' })).toBe(bell());
        expect(await within(panel).findByText('No notifications')).toBeDefined();
    });

    it('opens a linked notification without the admin base path and dismisses it', async () => {
        count.mockResolvedValue(1);
        list.mockResolvedValue([
            makeNotification('n1', 'Post published', '/cms/entries/post/e1'),
        ]);
        dismiss.mockResolvedValue(undefined);
        const view = renderAdmin(<NotificationBell />);

        const panel = await openPanel(view);
        await view.user.click(
            await within(panel).findByRole('button', { name: /Post published/ })
        );

        await waitFor(() => {
            expect(view.pathname()).toBe('/entries/post/e1');
        });
        expect(dismiss).toHaveBeenCalledWith({ id: 'n1' });
    });
});
