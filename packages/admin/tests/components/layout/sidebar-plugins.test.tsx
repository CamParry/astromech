/**
 * @vitest-environment happy-dom
 *
 * The sidebar's plugins block. A plugin nav item labelled with a translation
 * key shows the text from the plugin's own bundle, not the key.
 */

import { screen } from '@testing-library/react';
import i18n from 'i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/admin/components/layout/sidebar';
import { renderAdmin } from '../../_support/render-admin';

vi.mock('virtual:astromech/admin-config', () => ({
    default: {
        defaultLocale: 'en',
        locales: ['en'],
        entryTypes: {},
        pages: [],
        globals: {},
        plugins: [
            {
                namespace: 'backups',
                label: 'Backups',
                nav: [
                    {
                        label: 'Backups',
                        children: [
                            { label: { $t: 'nav.runs' }, to: '/plugin/backups/runs' },
                            { label: 'Settings', to: '/plugin/backups/settings' },
                        ],
                    },
                ],
            },
        ],
    },
}));

// The plugin's English bundle, loaded as `src/i18n.ts` loads it.
beforeAll(() => {
    i18n.addResourceBundle('en', 'backups', { nav: { runs: 'Backup runs' } });
});

describe('the sidebar plugins block', () => {
    it("shows a key-labelled item's text from the plugin's bundle", async () => {
        const { user } = renderAdmin(<Sidebar />);

        await user.click(await screen.findByRole('button', { name: 'Backups' }));

        expect(screen.getByRole('link', { name: 'Backup runs' })).toBeDefined();
        expect(screen.queryByText('nav.runs')).toBeNull();
    });
});
