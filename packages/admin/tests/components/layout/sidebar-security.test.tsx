/**
 * @vitest-environment happy-dom
 *
 * The sidebar's System block lists Security only for a user who holds
 * `security:manage`.
 */

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/admin/components/layout/sidebar';
import { renderAdmin } from '../../_support/render-admin';

vi.mock('virtual:astromech/admin-config', () => ({
    default: {
        defaultLocale: 'en',
        locales: ['en'],
        entryTypes: {},
        pages: [],
        plugins: [],
        globals: {},
    },
}));

function systemLinks(): { label: string; href: string | null }[] {
    const block = screen.queryByRole('navigation', { name: 'System' });
    if (block === null) return [];
    return within(block)
        .queryAllByRole('link')
        .map((a) => ({ label: a.textContent ?? '', href: a.getAttribute('href') }));
}

describe('the sidebar System block', () => {
    it('shows Security only with security:manage', async () => {
        renderAdmin(<Sidebar />, { permissions: ['security:manage'] });

        await waitFor(() => {
            expect(systemLinks()).toEqual([{ label: 'Security', href: '/security' }]);
        });
    });

    it('hides Security from a user without it', async () => {
        renderAdmin(<Sidebar />, { permissions: ['users:read'] });

        await waitFor(() => {
            expect(systemLinks()).toEqual([{ label: 'Users', href: '/users' }]);
        });
    });
});
