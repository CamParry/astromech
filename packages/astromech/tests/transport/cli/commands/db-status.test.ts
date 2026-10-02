/**
 * `astromech db:status`, run in process against a site in a temp directory: a
 * chain written by `db:generate` and applied by `db:init` to a real libsql
 * file database, through a real config file the CLI loads the way it loads a
 * site's (`tests/_support/cli.ts`).
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempSite, run, writeSiteConfig } from '@tests/cli';
import { resetRuntime } from '@tests/harness';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/database/registry';
import dbGenerate from '@/transport/cli/commands/db-generate';
import dbInit from '@/transport/cli/commands/db-init';
import dbStatus from '@/transport/cli/commands/db-status';

let siteDir: string;
let migrationsDir: string;

/**
 * The site's config. `remote` makes the driver report itself remote; it still
 * opens the local file, so `--allow-remote` has a database to read.
 */
function writeConfig(options: { remote?: boolean } = {}): Promise<string> {
    return writeSiteConfig(siteDir, {
        database: join(siteDir, 'database.db'),
        migrationsDir,
        remote: options.remote === true,
    });
}

/**
 * Generate and apply the first migration, then generate a second one that is
 * not applied: `0001_add-cron`, for a core table the snapshot stands in as
 * having gained since the last generate.
 */
async function generateUnappliedMigration(config: string): Promise<void> {
    await run(dbGenerate, ['--config', config]);
    await run(dbInit, ['--config', config]);
    const snapshotPath = join(migrationsDir, 'snapshot.json');
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf-8')) as {
        tables: Record<string, unknown>;
    };
    delete snapshot.tables['_astromech_cron'];
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    await run(dbGenerate, ['--config', config, '--name', 'add-cron']);
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

describe('db:status', () => {
    it('tells a database that was never initialised to run db:init', async () => {
        const config = await writeConfig();

        expect(await run(dbStatus, ['--config', config])).toEqual({
            stdout: ['No migrations table found. Run db:init first.'],
            stderr: [],
            exitCode: 0,
        });
    });

    it('lists the migrations db:init applied', async () => {
        const config = await writeConfig();
        await run(dbGenerate, ['--config', config]);
        await run(dbInit, ['--config', config]);

        expect(await run(dbStatus, ['--config', config])).toEqual({
            stdout: ['Applied migrations:', '  0000_migration'],
            stderr: [],
            exitCode: 0,
        });
    });

    // The setup the `it.fails` case below relies on: if this fails, that case
    // is failing for a reason other than the defect it names.
    it('has a generated migration that is not applied, for the case below', async () => {
        const config = await writeConfig();

        await generateUnappliedMigration(config);

        expect(await readdir(migrationsDir)).toContain('0001_add-cron.ts');
        const { rows } = await sql<{
            name: string;
        }>`SELECT name FROM kysely_migration ORDER BY name`.execute(getDb());
        expect(rows).toEqual([{ name: '0000_migration' }]);
    });

    // Defect: `db:status` reads only `kysely_migration`, never the config's
    // migrations folder, so a generated migration that has not been applied is
    // missing from its output. Its description is "Show migration status".
    it.fails('lists a generated migration that has not been applied', async () => {
        const config = await writeConfig();
        await generateUnappliedMigration(config);

        const { stdout: lines } = await run(dbStatus, ['--config', config]);

        expect(lines).toContain('  0000_migration');
        expect(lines.some((line) => line.includes('0001_add-cron'))).toBe(true);
    });

    it('refuses a remote database without --allow-remote, before opening it', async () => {
        const config = await writeConfig({ remote: true });

        expect(await run(dbStatus, ['--config', config])).toEqual({
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

    it('reads a remote database when --allow-remote is passed', async () => {
        const config = await writeConfig({ remote: true });

        expect(await run(dbStatus, ['--config', config, '--allow-remote'])).toEqual({
            stdout: ['No migrations table found. Run db:init first.'],
            stderr: [],
            exitCode: 0,
        });
    });
});
