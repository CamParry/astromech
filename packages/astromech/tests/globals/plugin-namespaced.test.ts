/**
 * A plugin's global is addressed by its qualified key (`<namespace>/<key>`) and
 * resolves against `pluginGlobals` alone, so a host global with the same bare
 * name is a different global with rows of its own.
 */

import type { AstromechConfig, PluginDefinition } from '@/types/index';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { GlobalNotFoundError } from '@/globals/errors';
import { globalsService as api } from '@/globals/service';
import { makeGlobalsConfig } from './globals-config';

const seoPlugin: PluginDefinition = {
    package: '@astromech/seo',
    globals: [
        {
            key: 'settings',
            label: 'SEO',
            fields: [{ name: 'titleTemplate', type: 'text', label: 'Title template' }],
        },
    ],
};

function configWithPlugin(): AstromechConfig {
    const base = makeGlobalsConfig();
    return {
        ...base,
        // A host global with the same BARE key as the plugin's.
        globals: [
            ...(base.globals ?? []),
            {
                key: 'settings',
                label: 'Settings',
                fields: [{ name: 'titleTemplate', type: 'text', label: 'Title' }],
            },
        ],
        plugins: [seoPlugin],
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(configWithPlugin());
});

describe('a plugin global', () => {
    it('round-trips under its qualified key', async () => {
        const saved = await api.update({
            key: 'seo/settings',
            data: { fields: { titleTemplate: '%s — Site' } },
        });
        expect(saved.key).toBe('seo/settings');

        const read = await api.get({ key: 'seo/settings', full: true });
        expect(read?.fields).toEqual({ titleTemplate: '%s — Site' });
    });

    it('is a different global from the host global of the same bare key', async () => {
        await api.update({
            key: 'seo/settings',
            data: { fields: { titleTemplate: 'p' } },
        });
        await api.update({ key: 'settings', data: { fields: { titleTemplate: 'h' } } });

        const plugin = await api.get({ key: 'seo/settings', full: true });
        const host = await api.get({ key: 'settings', full: true });

        expect(plugin?.fields['titleTemplate']).toBe('p');
        expect(host?.fields['titleTemplate']).toBe('h');
        expect(plugin?.id).not.toBe(host?.id);
    });

    it('refuses a qualified key no plugin declares', async () => {
        await expect(api.get({ key: 'nope/settings', full: true })).rejects.toThrow(
            GlobalNotFoundError
        );
    });
});
