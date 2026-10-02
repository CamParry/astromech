/**
 * @vitest-environment happy-dom
 *
 * The sidebar's globals block. A global is listed when it opts into the nav
 * and the signed-in user holds its own read permission — the block is not
 * gated as a whole, so one unreadable global hides only itself.
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
        globals: {
            site: { label: 'Site', nav: true },
            footer: { label: 'Footer', nav: true },
            hidden: { label: 'Hidden', nav: false },
            'seo/settings': { label: 'SEO settings', nav: true, plugin: 'seo' },
        },
    },
}));

function mountSidebar(permissions: string[]): void {
    renderAdmin(<Sidebar />, { permissions });
}

function globalLinks(): { label: string; href: string | null }[] {
    const block = screen.queryByRole('navigation', { name: 'Globals' });
    if (block === null) return [];
    return within(block)
        .queryAllByRole('link')
        .map((a) => ({
            label: a.textContent ?? '',
            href: a.getAttribute('href'),
        }));
}

describe('the sidebar globals block', () => {
    // A plugin's global is listed in that plugin's nav tree, not here.
    it('lists the nav-visible site globals the user may read', async () => {
        mountSidebar([
            'global:site:read',
            'global:footer:read',
            'global:hidden:read',
            'plugin:seo:global:settings:read',
        ]);

        await waitFor(() => {
            expect(globalLinks()).toEqual([
                { label: 'Site', href: '/globals/site' },
                { label: 'Footer', href: '/globals/footer' },
            ]);
        });
    });

    it('drops a global the user cannot read', async () => {
        mountSidebar(['global:site:read']);

        await waitFor(() => {
            expect(globalLinks().map((link) => link.label)).toEqual(['Site']);
        });
    });

    it('renders no block at all when nothing is readable', async () => {
        mountSidebar(['entry:post:read']);
        // The globals block renders in the same pass as the primary nav, so once
        // the nav is up an absent block stays absent.
        expect(await screen.findByRole('navigation', { name: 'Primary' })).toBeDefined();

        expect(screen.queryByRole('navigation', { name: 'Globals' })).toBeNull();
    });
});
