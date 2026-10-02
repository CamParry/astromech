/**
 * `astromech db:generate`, run in process against a site in a temp directory.
 *
 * The site's config file is real and loaded the way the CLI loads it. Its
 * `db` is a libsql file database built inline, because a config in a temp
 * directory cannot import `astromech/database/libsql` from source.
 */

import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectConsole } from '@tests/console';
import { resetRuntime } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/database/registry';
import dbGenerate from '@/transport/cli/commands/db-generate';

let siteDir: string;
let migrationsDir: string;
let printed: string[];

/**
 * Write `astromech.config.mjs` for the site and return its path. A remote
 * driver throws if it is opened, so a refusal is seen to come first.
 */
async function writeConfig(options: { remote?: boolean } = {}): Promise<string> {
    const file = join(siteDir, 'astromech.config.mjs');
    const url = `file:${join(siteDir, 'database.db')}`;
    await writeFile(
        file,
        `import { CamelCasePlugin, Kysely } from 'kysely';
        import { LibsqlDialect } from '@libsql/kysely-libsql';
        let instance;
        export default {
            db: {
                type: 'libsql',
                isRemote: () => ${options.remote === true},
                getInstance: () => {
                    if (${options.remote === true}) throw new Error('opened the remote database');
                    return (instance ??= new Kysely({
                        dialect: new LibsqlDialect({ url: ${JSON.stringify(url)} }),
                        plugins: [new CamelCasePlugin()],
                    }));
                },
            },
            entries: {},
            migrationsDir: ${JSON.stringify(migrationsDir)},
        };`
    );
    return file;
}

/** Run the command with `args`, as citty would after parsing them. */
async function run(args: Record<string, unknown>): Promise<void> {
    const runner = dbGenerate.run as (context: { args: unknown }) => Promise<void>;
    await runner({ args: { 'allow-remote': false, ...args } });
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
    siteDir = await mkdtemp(join(tmpdir(), 'astromech-cli-db-generate-'));
    migrationsDir = join(siteDir, 'migrations');
    // The config imports `kysely` and the libsql dialect, which a site has installed.
    await symlink(
        fileURLToPath(new URL('../../../../node_modules', import.meta.url)),
        join(siteDir, 'node_modules'),
        'dir'
    );
    printed = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
        printed.push(String(line));
    });
});

afterEach(async () => {
    try {
        await getDb().destroy();
    } catch {
        // A refused run never registered a database.
    }
    await rm(siteDir, { recursive: true, force: true });
});

describe('db:generate', () => {
    it('writes the first migration, journal, snapshot and index into an empty folder', async () => {
        await run({ config: await writeConfig() });

        expect(printed).toEqual([
            `[astromech db:generate] generated ${join(migrationsDir, '0000_migration.ts')}`,
        ]);
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
        await run({ config });
        const before = await migrationFiles();

        await run({ config });

        expect(printed.at(-1)).toBe('[astromech db:generate] no changes');
        expect(await migrationFiles()).toEqual(before);
    });

    it('writes a migration named by --name for a table the snapshot lacks', async () => {
        const config = await writeConfig();
        await run({ config });
        // Stand in for a core table added since the last generate.
        const snapshotPath = join(migrationsDir, 'snapshot.json');
        const snapshot = JSON.parse(await readFile(snapshotPath, 'utf-8')) as {
            tables: Record<string, unknown>;
        };
        delete snapshot.tables['_astromech_cron'];
        await writeFile(snapshotPath, JSON.stringify(snapshot));

        await run({ config, name: 'add-cron' });

        expect(printed.at(-1)).toBe(
            `[astromech db:generate] generated ${join(migrationsDir, '0001_add-cron.ts')}`
        );
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

        await expect(
            run({ config: await writeConfig(), ops, name: 'by-hand' })
        ).rejects.toThrow(
            `[astromech db:generate] --ops file "${ops}" must default-export a function`
        );
        await expect(readdir(migrationsDir)).rejects.toThrow(/ENOENT/);
    });

    it('refuses a remote database without --allow-remote, before opening it or writing', async () => {
        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`exit:${code}`);
        }) as never);
        expectConsole('error', /refusing to open the "libsql" database: it is remote/);

        await expect(
            run({ config: await writeConfig({ remote: true }) })
        ).rejects.toThrow('exit:1');
        await expect(readdir(migrationsDir)).rejects.toThrow(/ENOENT/);
    });
});
