/**
 * `astromech db:status`, run in process against a site in a temp directory: a
 * chain written by `db:generate` and applied by `db:init` to a real libsql
 * file database.
 *
 * The site's config file is real and loaded the way the CLI loads it. Its
 * `db` is a libsql file database built inline, because a config in a temp
 * directory cannot import `astromech/database/libsql` from source.
 */

import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectConsole } from '@tests/console';
import { resetRuntime } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/database/registry';
import dbGenerate from '@/transport/cli/commands/db-generate';
import dbInit from '@/transport/cli/commands/db-init';
import dbStatus from '@/transport/cli/commands/db-status';

let siteDir: string;
let migrationsDir: string;
let printed: string[];

/**
 * Write `astromech.config.mjs` for the site and return its path. `remote`
 * makes the driver report itself remote; it still opens the local file, so
 * `--allow-remote` has a database to read.
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
                getInstance: () =>
                    (instance ??= new Kysely({
                        dialect: new LibsqlDialect({ url: ${JSON.stringify(url)} }),
                        plugins: [new CamelCasePlugin()],
                    })),
            },
            entries: {},
            migrationsDir: ${JSON.stringify(migrationsDir)},
        };`
    );
    return file;
}

/** Run `command` with `args`, as citty would after parsing them. */
async function run(
    command: { run?: unknown },
    args: Record<string, unknown>
): Promise<void> {
    const runner = command.run as (context: { args: unknown }) => Promise<void>;
    await runner({ args: { 'allow-remote': false, ...args } });
}

/** What `db:status` prints, on its own. */
async function status(args: Record<string, unknown>): Promise<string[]> {
    printed = [];
    await run(dbStatus, args);
    return printed;
}

beforeEach(async () => {
    resetRuntime();
    siteDir = await mkdtemp(join(tmpdir(), 'astromech-cli-db-status-'));
    migrationsDir = join(siteDir, 'migrations');
    // The config and the generated chain import `kysely`, which a site has installed.
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

describe('db:status', () => {
    it('tells a database that was never initialised to run db:init', async () => {
        expect(await status({ config: await writeConfig() })).toEqual([
            'No migrations table found. Run db:init first.',
        ]);
    });

    it('lists the migrations db:init applied', async () => {
        const config = await writeConfig();
        await run(dbGenerate, { config });
        await run(dbInit, { config });

        expect(await status({ config })).toEqual([
            'Applied migrations:',
            '  0000_migration',
        ]);
    });

    // Defect: `db:status` reads only `kysely_migration`, never the config's
    // migrations folder, so a generated migration that has not been applied is
    // missing from its output. Its description is "Show migration status".
    it.fails('lists a generated migration that has not been applied', async () => {
        const config = await writeConfig();
        await run(dbGenerate, { config });
        await run(dbInit, { config });
        // Stand in for a core table added since the last generate.
        const snapshotPath = join(migrationsDir, 'snapshot.json');
        const snapshot = JSON.parse(await readFile(snapshotPath, 'utf-8')) as {
            tables: Record<string, unknown>;
        };
        delete snapshot.tables['_astromech_cron'];
        await writeFile(snapshotPath, JSON.stringify(snapshot));
        await run(dbGenerate, { config, name: 'add-cron' });

        const lines = await status({ config });

        expect(lines).toContain('  0000_migration');
        expect(lines.some((line) => line.includes('0001_add-cron'))).toBe(true);
    });

    it('refuses a remote database without --allow-remote, before opening it', async () => {
        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`exit:${code}`);
        }) as never);
        expectConsole('error', /refusing to open the "libsql" database: it is remote/);

        await expect(
            status({ config: await writeConfig({ remote: true }) })
        ).rejects.toThrow('exit:1');
        expect(() => getDb()).toThrow();
    });

    it('reads a remote database when --allow-remote is passed', async () => {
        const config = await writeConfig({ remote: true });

        expect(await status({ config, 'allow-remote': true })).toEqual([
            'No migrations table found. Run db:init first.',
        ]);
    });
});
