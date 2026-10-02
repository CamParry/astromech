/**
 * `astromech db:init`, run in process against a site in a temp directory: a
 * chain written by `db:generate`, applied to a real libsql file database.
 *
 * The site's config file is real and loaded the way the CLI loads it. Its
 * `db` is a libsql file database built inline, because a config in a temp
 * directory cannot import `astromech/database/libsql` from source.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectConsole } from '@tests/console';
import { resetRuntime } from '@tests/harness';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/database/registry';
import { CORE_TABLES } from '@/database/tables';
import dbGenerate from '@/transport/cli/commands/db-generate';
import dbInit from '@/transport/cli/commands/db-init';

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

/** Run `command` with `args`, as citty would after parsing them. */
async function run(
    command: { run?: unknown },
    args: Record<string, unknown>
): Promise<void> {
    const runner = command.run as (context: { args: unknown }) => Promise<void>;
    await runner({ args: { 'allow-remote': false, ...args } });
}

/** The migrations the database records as applied, in order. */
async function appliedMigrations(db: Kysely<DB>): Promise<string[]> {
    const { rows } = await sql<{
        name: string;
    }>`SELECT name FROM kysely_migration ORDER BY name`.execute(db);
    return rows.map((row) => row.name);
}

/** The tables the database holds, sorted. */
async function tableNames(db: Kysely<DB>): Promise<string[]> {
    const { rows } = await sql<{ name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
    `.execute(db);
    return rows.map((row) => row.name);
}

beforeEach(async () => {
    resetRuntime();
    siteDir = await mkdtemp(join(tmpdir(), 'astromech-cli-db-init-'));
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

describe('db:init', () => {
    it('migrates an empty database to every core table', async () => {
        const config = await writeConfig();
        await run(dbGenerate, { config });

        await run(dbInit, { config });

        expect(printed.slice(-2)).toEqual([
            'Running migrations...',
            'Database migrations applied',
        ]);
        const db = getDb();
        expect(await appliedMigrations(db)).toEqual(['0000_migration']);
        const tables = await tableNames(db);
        for (const table of CORE_TABLES) {
            expect(tables).toContain(table.name);
        }
    });

    it('changes nothing when run a second time', async () => {
        const config = await writeConfig();
        await run(dbGenerate, { config });
        await run(dbInit, { config });
        const db = getDb();
        await sql`
            INSERT INTO _astromech_cron (name, schedule) VALUES ('kept', '* * * * *')
        `.execute(db);
        const tablesBefore = await tableNames(db);

        await run(dbInit, { config });

        expect(printed.at(-1)).toBe('Database migrations applied');
        expect(await appliedMigrations(db)).toEqual(['0000_migration']);
        expect(await tableNames(db)).toEqual(tablesBefore);
        const { rows } = await sql<{
            name: string;
        }>`SELECT name FROM _astromech_cron`.execute(db);
        expect(rows).toEqual([{ name: 'kept' }]);
    });

    it('fails, naming the folder, when the migrations folder has no chain', async () => {
        await expect(run(dbInit, { config: await writeConfig() })).rejects.toThrow(
            join(migrationsDir, 'index.ts')
        );
    });

    it('refuses a remote database without --allow-remote, before opening it', async () => {
        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`exit:${code}`);
        }) as never);
        expectConsole('error', /refusing to open the "libsql" database: it is remote/);

        await expect(
            run(dbInit, { config: await writeConfig({ remote: true }) })
        ).rejects.toThrow('exit:1');
        expect(() => getDb()).toThrow();
    });
});
