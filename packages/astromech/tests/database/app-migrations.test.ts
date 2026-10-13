/**
 * Unit tests for `database/app-migrations.ts`: where the migrations folder is,
 * and the check that the provider the config imports is the chain its journal
 * lists.
 */

import type { PluginDefinition } from '@/types/index';
import type { MigrationProvider } from 'kysely/migration';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { noMigrations } from '@tests/fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    assertMatchesJournal,
    checkedMigrationProvider,
    resolveMigrationsDir,
} from '@/database/app-migrations';
import { AstromechError } from '@/errors/astromech-error';

const created: string[] = [];

/** A throwaway migrations folder whose `journal.json` lists `tags`, or has none. */
async function migrationsFolder(tags?: string[]): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'astromech-migrations-'));
    created.push(dir);
    if (tags !== undefined) {
        const entries = tags.map((tag, idx) => ({ idx, tag, when: 0 }));
        await writeFile(
            join(dir, 'journal.json'),
            JSON.stringify({ version: 1, dialect: 'sqlite', entries })
        );
    }
    return dir;
}

/** A provider listing `names`, each a migration that does nothing. */
function providerOf(...names: string[]): MigrationProvider {
    const up = (): Promise<void> => Promise.resolve();
    return {
        getMigrations: () =>
            Promise.resolve(Object.fromEntries(names.map((name) => [name, { up }]))),
    };
}

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
        created.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
});

describe('resolveMigrationsDir', () => {
    it('resolves a relative folder against the working directory', () => {
        vi.spyOn(process, 'cwd').mockReturnValue('/site');

        expect(resolveMigrationsDir('./database/migrations')).toBe(
            '/site/database/migrations'
        );
        expect(resolveMigrationsDir('./migrations')).toBe('/site/migrations');
    });

    it('keeps an absolute folder as written', () => {
        vi.spyOn(process, 'cwd').mockReturnValue('/site');

        expect(resolveMigrationsDir('/srv/migrations')).toBe('/srv/migrations');
    });
});

describe('assertMatchesJournal', () => {
    it("returns the provider's names when they are the journal's", async () => {
        const dir = await migrationsFolder(['0000_baseline', '0001_next']);

        await expect(
            assertMatchesJournal(providerOf('0000_baseline', '0001_next'), dir)
        ).resolves.toEqual(['0000_baseline', '0001_next']);
    });

    it('refuses a provider imported from another folder, naming both differences', async () => {
        const dir = await migrationsFolder(['0000_baseline', '0001_next']);

        const check = assertMatchesJournal(
            providerOf('0000_baseline', '0001_other'),
            dir
        );

        await expect(check).rejects.toBeInstanceOf(AstromechError);
        await expect(check).rejects.toThrow(
            `the config's \`migrations\` does not match ${join(dir, 'journal.json')}. ` +
                'Only in `migrations`: 0001_other. Only in the journal: 0001_next. ' +
                `Import \`migrationProvider\` from the \`index.ts\` in ${dir}`
        );
    });

    it('reads a folder with no journal as listing no migrations', async () => {
        const dir = await migrationsFolder();

        await expect(assertMatchesJournal(noMigrations, dir)).resolves.toEqual([]);
        await expect(
            assertMatchesJournal(providerOf('0000_baseline'), dir)
        ).rejects.toThrow(
            'Only in `migrations`: 0000_baseline. Only in the journal: none.'
        );
    });
});

describe('checkedMigrationProvider', () => {
    it('merges each plugin chain into the checked app chain', async () => {
        const dir = await migrationsFolder(['0000_baseline']);
        const plugin = {
            package: '@example/plugin',
            migrations: providerOf('0000_init'),
        } as PluginDefinition;

        const provider = await checkedMigrationProvider(
            { migrations: providerOf('0000_baseline'), plugins: [plugin] },
            dir
        );

        expect(Object.keys((await provider?.getMigrations()) ?? {})).toEqual([
            '0000_baseline',
            'plugin_example_plugin_0000_init',
        ]);
    });

    it('is null for a site that has not generated its chain yet', async () => {
        const dir = await migrationsFolder();

        await expect(
            checkedMigrationProvider({ migrations: noMigrations }, dir)
        ).resolves.toBeNull();
    });
});
