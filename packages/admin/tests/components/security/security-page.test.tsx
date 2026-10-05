/**
 * @vitest-environment happy-dom
 *
 * The Security screen lists the block list and the allow list, adds an address
 * from a dialog, removes one after a confirmation, and sends a user without
 * `security:manage` to the dashboard.
 */

import type { AllowedAddress, BlockedAddress } from '@/types/index';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecurityPage } from '@/admin/components/security/security-page';
import { renderAdmin } from '../../_support/render-admin';

const security = vi.hoisted(() => ({
    listBlocked: vi.fn(),
    block: vi.fn(),
    unblock: vi.fn(),
    listAllowed: vi.fn(),
    allow: vi.fn(),
    removeAllowed: vi.fn(),
}));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: { ...real.astromechUntypedClient, security },
    };
});

const MANUAL: BlockedAddress = {
    id: 'b1',
    address: '203.0.113.7',
    reason: 'Scraper',
    source: 'manual',
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: 'u1',
};

const AUTOMATIC: BlockedAddress = {
    id: 'b2',
    address: '198.51.100.0/24',
    reason: 'Repeated failed sign-ins',
    source: 'automatic',
    expiresAt: new Date('2026-01-01T01:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: null,
};

const ALLOWED: AllowedAddress = {
    id: 'a1',
    address: '192.0.2.10',
    reason: 'Office',
    createdAt: new Date('2026-01-02T00:00:00Z'),
    createdBy: 'u1',
};

beforeEach(() => {
    security.listBlocked.mockResolvedValue([MANUAL, AUTOMATIC]);
    security.listAllowed.mockResolvedValue([ALLOWED]);
});

afterEach(() => {
    for (const method of Object.values(security)) method.mockReset();
    vi.useRealTimers();
});

function mountPage() {
    return renderAdmin(
        [
            { path: '/security', component: SecurityPage },
            { path: '/', component: () => <p>Dashboard</p> },
        ],
        { url: '/security', permissions: ['security:manage'] }
    );
}

/** The row `text` sits in. */
async function rowOf(text: string): Promise<HTMLElement> {
    const row = (await screen.findByText(text)).closest('tr');
    if (row === null) throw new Error(`no row holds ${text}`);
    return row;
}

describe('the blocked addresses', () => {
    it('lists blocked addresses with their source and expiry', async () => {
        mountPage();

        const manual = within(await rowOf('203.0.113.7'));
        expect(manual.getByText('Scraper')).toBeTruthy();
        expect(manual.getByText('Manual')).toBeTruthy();
        expect(manual.getByText('Never')).toBeTruthy();
        const automatic = within(await rowOf('198.51.100.0/24'));
        expect(automatic.getByText('Automatic')).toBeTruthy();
        expect(automatic.queryByText('Never')).toBeNull();
    });

    it('blocks an address from the dialog', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2030-01-01T12:00:00.000Z'));
        security.block.mockResolvedValue(MANUAL);
        const page = mountPage();
        await screen.findByText('203.0.113.7');

        await page.user.click(screen.getByRole('button', { name: 'Block address' }));
        const dialog = await screen.findByRole('dialog');
        await page.user.type(within(dialog).getByLabelText('Address'), '203.0.113.99');
        await page.user.type(within(dialog).getByLabelText('Reason'), 'Probing');
        await page.user.click(within(dialog).getByRole('combobox'));
        await page.user.click(await screen.findByRole('option', { name: 'In 1 hour' }));
        await page.user.click(
            within(dialog).getByRole('button', { name: 'Block address' })
        );

        await waitFor(() =>
            expect(security.block).toHaveBeenCalledWith({
                data: {
                    address: '203.0.113.99',
                    reason: 'Probing',
                    expiresAt: new Date('2030-01-01T13:00:00.000Z'),
                },
            })
        );
        // A toast has the dialog role too, so look for the form itself.
        await waitFor(() => expect(screen.queryByLabelText('Address')).toBeNull());
    });

    it('unblocks after confirming', async () => {
        security.unblock.mockResolvedValue(undefined);
        const page = mountPage();
        const row = await rowOf('203.0.113.7');

        await page.user.click(within(row).getByRole('button', { name: 'Actions' }));
        await page.user.click(await screen.findByRole('menuitem', { name: 'Unblock' }));
        expect(await screen.findByText('Unblock this address?')).toBeTruthy();
        expect(security.unblock).not.toHaveBeenCalled();
        await page.user.click(screen.getByRole('button', { name: 'Unblock' }));

        await waitFor(() => expect(security.unblock).toHaveBeenCalledWith({ id: 'b1' }));
    });

    it('keeps the dialog open and shows the refusal when the block fails', async () => {
        security.block.mockRejectedValue(
            new Error(
                'That range covers your own address, so blocking it would lock you out.'
            )
        );
        const page = mountPage();
        await screen.findByText('203.0.113.7');

        await page.user.click(screen.getByRole('button', { name: 'Block address' }));
        const dialog = await screen.findByRole('dialog');
        await page.user.type(within(dialog).getByLabelText('Address'), '0.0.0.0/0');
        await page.user.click(
            within(dialog).getByRole('button', { name: 'Block address' })
        );

        expect(await screen.findByText(/lock you out/)).toBeTruthy();
        expect(screen.getByLabelText('Address')).toBeTruthy();
    });
});

describe('the allowed addresses', () => {
    it('lists and removes allowed addresses', async () => {
        security.removeAllowed.mockResolvedValue(undefined);
        const page = mountPage();

        await page.user.click(
            await screen.findByRole('tab', { name: 'Allowed addresses' })
        );
        const row = await rowOf('192.0.2.10');
        expect(within(row).getByText('Office')).toBeTruthy();
        await page.user.click(within(row).getByRole('button', { name: 'Actions' }));
        await page.user.click(await screen.findByRole('menuitem', { name: 'Remove' }));
        await page.user.click(await screen.findByRole('button', { name: 'Remove' }));

        await waitFor(() =>
            expect(security.removeAllowed).toHaveBeenCalledWith({ id: 'a1' })
        );
    });

    it('allows an address from the dialog', async () => {
        security.allow.mockResolvedValue(ALLOWED);
        const page = mountPage();
        await page.user.click(
            await screen.findByRole('tab', { name: 'Allowed addresses' })
        );

        await page.user.click(screen.getByRole('button', { name: 'Allow address' }));
        const dialog = await screen.findByRole('dialog');
        await page.user.type(within(dialog).getByLabelText('Address'), '192.0.2.0/28');
        await page.user.click(
            within(dialog).getByRole('button', { name: 'Allow address' })
        );

        await waitFor(() =>
            expect(security.allow).toHaveBeenCalledWith({
                data: { address: '192.0.2.0/28', reason: null },
            })
        );
    });
});

describe('access', () => {
    it('sends a user without security:manage to the dashboard', async () => {
        const page = renderAdmin(
            [
                { path: '/security', component: SecurityPage },
                { path: '/', component: () => <p>Dashboard</p> },
            ],
            { url: '/security', permissions: ['users:read'] }
        );

        await waitFor(() => expect(page.pathname()).toBe('/'));
    });
});
