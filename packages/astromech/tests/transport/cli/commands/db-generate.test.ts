/**
 * `astromech db:generate`, run in process against a site in a temp directory,
 * through a real config file the CLI loads the way it loads a site's
 * (`tests/_support/cli.ts`).
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempSite, run, runOk, writeSiteConfig } from '@tests/cli';
import { resetRuntime } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/database/registry';
import dbGenerate from '@/transport/cli/commands/db-generate';

let siteDir: string;
let migrationsDir: string;

/**
 * The site's config. A remote driver throws if it is opened, so a refusal is
 * seen to come first.
 */
function writeConfig(options: { remote?: boolean } = {}): Promise<string> {
    return writeSiteConfig(siteDir, {
        database: join(siteDir, 'database.db'),
        migrationsDir,
        remote: options.remote === true,
        throwOnOpen: options.remote === true,
    });
}

/** Every file in the migrations folder, by name, with its contents. */
async function migrationFiles(): Promise<Record<string, string>> {
    const names = (await readdir(migrationsDir)).sort();
    const files: Record<string, string> = {};
    for (const name of names) {
        files[name] = await readFile(join(migrationsDir, name), 'utf-8');
    }
    return files;
}

beforeEach(async () => {
    resetRuntime();
    siteDir = await createTempSite();
    migrationsDir = join(siteDir, 'migrations');
});

afterEach(async () => {
    try {
        await getDb().destroy();
    } catch {
        // A refused run never registered a database.
    }
});

describe('db:generate', () => {
    it('writes the first migration, journal, snapshot and index into an empty folder', async () => {
        const result = await run(dbGenerate, ['--config', await writeConfig()]);

        expect(result).toEqual({
            stdout: [
                `[astromech db:generate] generated ${join(migrationsDir, '0000_migration.ts')}`,
            ],
            stderr: [],
            exitCode: 0,
        });
        const files = await migrationFiles();
        expect(Object.keys(files)).toEqual([
            '0000_migration.ts',
            'index.ts',
            'journal.json',
            'snapshot.json',
        ]);
        expect(files['0000_migration.ts']).toContain('_astromech_cron');
        expect(files['index.ts']).toContain("import * as m0000 from './0000_migration';");
        const snapshot = JSON.parse(files['snapshot.json'] ?? '{}') as {
            tables: Record<string, unknown>;
        };
        expect(snapshot.tables).toHaveProperty('_astromech_cron');
    });

    it('writes nothing when the tables match the snapshot', async () => {
        const config = await writeConfig();
        await runOk(dbGenerate, ['--config', config]);
        const before = await migrationFiles();

        const result = await run(dbGenerate, ['--config', config]);

        expect(result).toEqual({
            stdout: ['[astromech db:generate] no changes'],
            stderr: [],
            exitCode: 0,
        });
        expect(await migrationFiles()).toEqual(before);
    });

    it('writes a migration named by --name for a table the snapshot lacks', async () => {
        const config = await writeConfig();
        await runOk(dbGenerate, ['--config', config]);
        // Stand in for a core table added since the last generate.
        const snapshotPath = join(migrationsDir, 'snapshot.json');
        const snapshot = JSON.parse(await readFile(snapshotPath, 'utf-8')) as {
            tables: Record<string, unknown>;
        };
        delete snapshot.tables['_astromech_cron'];
        await writeFile(snapshotPath, JSON.stringify(snapshot));

        const result = await run(dbGenerate, ['--config', config, '--name', 'add-cron']);

        expect(result).toEqual({
            stdout: [
                `[astromech db:generate] generated ${join(migrationsDir, '0001_add-cron.ts')}`,
            ],
            stderr: [],
            exitCode: 0,
        });
        const files = await migrationFiles();
        expect(Object.keys(files)).toEqual([
            '0000_migration.ts',
            '0001_add-cron.ts',
            'index.ts',
            'journal.json',
            'snapshot.json',
        ]);
        // Only the missing table, not the whole schema again.
        const created = [
            ...(files['0001_add-cron.ts'] ?? '').matchAll(/CREATE TABLE \\`(\w+)\\`/g),
        ].map((match) => match[1]);
        expect(created).toEqual(['_astromech_cron']);
        expect(files['index.ts']).toContain("import * as m0001 from './0001_add-cron';");
        const journal = JSON.parse(files['journal.json'] ?? '{}') as {
            entries: { tag: string }[];
        };
        expect(journal.entries.map((entry) => entry.tag)).toEqual([
            '0000_migration',
            '0001_add-cron',
        ]);
        expect(JSON.parse(files['snapshot.json'] ?? '{}')).toHaveProperty([
            'tables',
            '_astromech_cron',
        ]);
    });

    it('refuses an --ops file that does not default-export a function, writing nothing', async () => {
        const ops = join(siteDir, 'ops.mjs');
        await writeFile(ops, 'export const ops = [];');
        const config = await writeConfig();

        await expect(
            run(dbGenerate, ['--config', config, '--ops', ops, '--name', 'by-hand'])
        ).rejects.toThrow(
            `[astromech db:generate] --ops file "${ops}" must default-export a function`
        );
        await expect(readdir(migrationsDir)).rejects.toThrow(/ENOENT/);
    });

    it('refuses a remote database without --allow-remote, before opening it or writing', async () => {
        const config = await writeConfig({ remote: true });

        expect(await run(dbGenerate, ['--config', config])).toEqual({
            stdout: [],
            stderr: [
                expect.stringMatching(
                    /refusing to open the "libsql" database: it is remote/
                ),
            ],
            exitCode: 1,
        });
        await expect(readdir(migrationsDir)).rejects.toThrow(/ENOENT/);
    });
});
