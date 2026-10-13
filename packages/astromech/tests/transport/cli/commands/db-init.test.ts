/**
 * `astromech db:init`, run in process against a site in a temp directory: a
 * chain written by `db:generate`, applied to a real libsql file database,
 * through a real config file the CLI loads the way it loads a site's
 * (`tests/_support/cli.ts`).
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempSite, run, runOk, writeSiteConfig } from '@tests/cli';
import { resetRuntime } from '@tests/harness';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/database/registry';
import { CORE_TABLES } from '@/database/tables';
import dbGenerate from '@/transport/cli/commands/db-generate';
import dbInit from '@/transport/cli/commands/db-init';

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

describe('db:init', () => {
    it('migrates an empty database to every core table', async () => {
        const config = await writeConfig();
        await runOk(dbGenerate, ['--config', config]);

        const result = await run(dbInit, ['--config', config]);

        expect(result).toEqual({
            stdout: ['Running migrations...', 'Database migrations applied'],
            stderr: [],
            exitCode: 0,
        });
        const db = getDb();
        expect(await appliedMigrations(db)).toEqual(['0000_migration']);
        const tables = await tableNames(db);
        for (const table of CORE_TABLES) {
            expect(tables).toContain(table.name);
        }
    });

    it('changes nothing when run a second time', async () => {
        const config = await writeConfig();
        await runOk(dbGenerate, ['--config', config]);
        await runOk(dbInit, ['--config', config]);
        const db = getDb();
        await sql`
            INSERT INTO _astromech_cron (name, schedule) VALUES ('kept', '* * * * *')
        `.execute(db);
        const tablesBefore = await tableNames(db);

        const result = await run(dbInit, ['--config', config]);

        expect(result).toEqual({
            stdout: ['Running migrations...', 'Database migrations applied'],
            stderr: [],
            exitCode: 0,
        });
        expect(await appliedMigrations(db)).toEqual(['0000_migration']);
        expect(await tableNames(db)).toEqual(tablesBefore);
        const { rows } = await sql<{
            name: string;
        }>`SELECT name FROM _astromech_cron`.execute(db);
        expect(rows).toEqual([{ name: 'kept' }]);
    });

    it('fails, naming the folder, before db:generate has written a chain', async () => {
        const config = await writeConfig();

        await expect(run(dbInit, ['--config', config])).rejects.toThrow(
            `${migrationsDir} has no migrations. Run \`astromech db:generate\` first.`
        );
    });

    it('refuses a config whose migrations are not the chain in migrationsDir', async () => {
        const config = await writeConfig();
        await runOk(dbGenerate, ['--config', config]);
        // The config imports one folder; `migrationsDir` names another.
        const other = join(siteDir, 'other');
        await mkdir(other);
        await writeFile(
            join(other, 'journal.json'),
            JSON.stringify({ version: 1, dialect: 'sqlite', entries: [] })
        );
        const mismatched = await writeSiteConfig(siteDir, {
            database: join(siteDir, 'database.db'),
            migrationsDir,
        });
        await writeFile(
            mismatched,
            (await readFile(mismatched, 'utf-8')).replace(
                /migrationsDir: ".*",/,
                `migrationsDir: ${JSON.stringify(other)},`
            )
        );

        await expect(run(dbInit, ['--config', mismatched])).rejects.toThrow(
            `the config's \`migrations\` does not match ${join(other, 'journal.json')}. ` +
                'Only in `migrations`: 0000_migration. Only in the journal: none.'
        );
        expect(await tableNames(getDb())).toEqual([]);
    });

    it('applies a migration db:generate wrote earlier in the same process', async () => {
        const config = await writeConfig();
        await runOk(dbGenerate, ['--config', config]);
        await runOk(dbInit, ['--config', config]);
        // Stand in for a core table added since: drop it from the database and
        // the snapshot, so the next generate writes a migration creating it.
        await sql`DROP TABLE _astromech_cron`.execute(getDb());
        const snapshotPath = join(migrationsDir, 'snapshot.json');
        const snapshot = JSON.parse(await readFile(snapshotPath, 'utf-8')) as {
            tables: Record<string, unknown>;
        };
        delete snapshot.tables['_astromech_cron'];
        await writeFile(snapshotPath, JSON.stringify(snapshot));
        await runOk(dbGenerate, ['--config', config, '--name', 'add-cron']);

        await runOk(dbInit, ['--config', config]);

        expect(await appliedMigrations(getDb())).toEqual([
            '0000_migration',
            '0001_add-cron',
        ]);
        expect(await tableNames(getDb())).toContain('_astromech_cron');
    });

    it('refuses a remote database without --allow-remote, before opening it', async () => {
        const config = await writeConfig({ remote: true });

        expect(await run(dbInit, ['--config', config])).toEqual({
            stdout: [],
            stderr: [
                expect.stringMatching(
                    /refusing to open the "libsql" database: it is remote/
                ),
            ],
            exitCode: 1,
        });
        expect(() => getDb()).toThrow();
    });
});
