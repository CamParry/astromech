/**
 * `collectPluginMigrations` — the CMS half of the plugin migration story.
 *
 * It turns `PluginDefinition[]` into the `{ alias, provider }[]` the engine's
 * `mergeMigrationProviders` consumes: alias is the namespace `resolvePluginIdentity`
 * derives from the package (there is no override), and plugins
 * shipping no `migrations` provider drop out. The merge itself is engine-generic
 * and covered in `packages/schema-engine/tests/apply.test.ts`.
 */

import type { PluginDefinition } from '@/types/index';
import type { MigrationProvider } from 'kysely';
import { describe, expect, it } from 'vitest';
import { collectPluginMigrations } from '@/database/plugin-migrations';

function provider(name: string): MigrationProvider {
    return {
        getMigrations() {
            return Promise.resolve({ [name]: { up: () => Promise.resolve() } });
        },
    };
}

describe('collectPluginMigrations', () => {
    it('derives the alias from the package name', () => {
        const backups = provider('0000_backups');
        const collected = collectPluginMigrations([
            { package: '@astromech/backups', migrations: backups },
        ]);

        expect(collected).toEqual([{ alias: 'backups', provider: backups }]);
    });

    it('keeps a third-party scope in the derived alias', () => {
        const collected = collectPluginMigrations([
            {
                package: '@acme/redirects',
                migrations: provider('0000_init'),
            },
        ]);

        expect(collected.map((entry) => entry.alias)).toEqual(['acme_redirects']);
    });

    it('skips plugins without a migrations provider', () => {
        const withMigrations = provider('0000_init');
        const collected = collectPluginMigrations([
            { package: '@astromech/menus' },
            { package: '@astromech/backups', migrations: withMigrations },
        ]);

        expect(collected).toEqual([{ alias: 'backups', provider: withMigrations }]);
    });

    it('returns an empty list when no plugin ships migrations', () => {
        const collected = collectPluginMigrations([
            { package: '@astromech/menus' },
            { package: '@astromech/seo' },
        ]);

        expect(collected).toEqual([]);
    });

    it('preserves `config.plugins` order', () => {
        const defs: PluginDefinition[] = [
            { package: '@astromech/redirects', migrations: provider('0000_redirects') },
            { package: '@astromech/menus' },
            { package: '@astromech/backups', migrations: provider('0000_backups') },
        ];

        expect(collectPluginMigrations(defs).map((entry) => entry.alias)).toEqual([
            'redirects',
            'backups',
        ]);
    });

    it('carries each plugin its own provider instance', async () => {
        const collected = collectPluginMigrations([
            { package: '@astromech/redirects', migrations: provider('0000_redirects') },
            { package: '@astromech/backups', migrations: provider('0000_backups') },
        ]);

        const names = await Promise.all(
            collected.map(async (entry) =>
                Object.keys(await entry.provider.getMigrations())
            )
        );
        expect(names).toEqual([['0000_redirects'], ['0000_backups']]);
    });
});
