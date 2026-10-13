/**
 * @vitest-environment happy-dom
 *
 * A plugin's component page. Its header names the plugin and the page, and a
 * page labelled with a translation key shows the text from the plugin's own
 * bundle, not the key.
 */

import type { RouteComponent } from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import i18n from 'i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Route } from '@/admin/pages/_protected/plugin/$';
import { renderAdmin } from '../../_support/render-admin';

vi.mock('virtual:astromech/admin-config', async (importOriginal) => {
    const real = await importOriginal<{ default: object }>();
    return {
        default: {
            ...real.default,
            plugins: [
                {
                    namespace: 'backups',
                    serviceKey: 'backups',
                    permissionNamespace: 'backups',
                    label: 'Backups',
                    nav: [],
                    resources: [],
                    pages: [
                        {
                            key: 'backups/runs',
                            path: '/runs',
                            label: { $t: 'nav.runs' },
                            componentKey: 'backups/runs',
                            permission: null,
                            nav: true,
                        },
                    ],
                },
            ],
        },
    };
});

// The codegen registry carries the key, as it does for a key-labelled page.
vi.mock('virtual:astromech/plugins/components', async (importOriginal) => {
    const real = await importOriginal<object>();
    return {
        ...real,
        pages: {
            'backups/runs': {
                load: () => Promise.resolve({ default: () => <p>Runs body</p> }),
                plugin: 'backups',
                permission: null,
                label: 'nav.runs',
            },
        },
    };
});

const PluginPage = Route.options.component as RouteComponent;

// The plugin's English bundle, loaded as `src/i18n.ts` loads it.
beforeAll(() => {
    i18n.addResourceBundle('en', 'backups', { nav: { runs: 'Runs' } });
});

describe('a plugin component page', () => {
    it("titles a key-labelled page with the text from the plugin's bundle", async () => {
        renderAdmin([{ path: '/plugin/$', component: PluginPage }], {
            url: '/plugin/backups/runs',
        });

        expect(
            await screen.findByRole('heading', { name: 'Backups Runs' })
        ).toBeDefined();
        expect(screen.queryByText(/nav\.runs/)).toBeNull();
    });
});
