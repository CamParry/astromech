/**
 * `astromech db:init`, run in process against a site in a temp directory: a
 * chain written by `db:generate`, applied to a real libsql file database,
 * through a real config file the CLI loads the way it loads a site's
 * (`tests/_support/cli.ts`).
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { join } from 'node:path';
import { createTempSite, run, writeSiteConfig } from '@tests/cli';
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
        await run(dbGenerate, ['--config', config]);

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
        await run(dbGenerate, ['--config', config]);
        await run(dbInit, ['--config', config]);
        const db = getDb();
        await sql`
            INSERT INTO _astromech_cron (name, schedule) VALUES ('kept', '* * * * *')
        `.execute(db);
        const tablesBefore = await tableNames(db);

        const result = await run(dbInit, ['--config', config]);

        expect(result.stdout.at(-1)).toBe('Database migrations applied');
        expect(result.exitCode).toBe(0);
        expect(await appliedMigrations(db)).toEqual(['0000_migration']);
        expect(await tableNames(db)).toEqual(tablesBefore);
        const { rows } = await sql<{
            name: string;
        }>`SELECT name FROM _astromech_cron`.execute(db);
        expect(rows).toEqual([{ name: 'kept' }]);
    });

    it('fails, naming the folder, when the migrations folder has no chain', async () => {
        const config = await writeConfig();

        await expect(run(dbInit, ['--config', config])).rejects.toThrow(
            join(migrationsDir, 'index.ts')
        );
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
