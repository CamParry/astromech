/**
 * `astromech db:rebaseline`, run in process against a migration chain in a
 * site in a temp directory, through a real config file the CLI loads the way
 * it loads a site's (`tests/_support/cli.ts`). The command never opens the
 * database.
 *
 * The bannered chain is kept in `fixtures/bannered-baseline/`, with the
 * migration sources stored as `.ts.txt`: the command reads them as text, and a
 * `.ts` file nothing imports would be reported as unused.
 */

import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempSite, run, writeSiteConfig } from '@tests/cli';
import { resetRuntime } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateMigrations } from '@/database/generate';
import { CORE_TABLES, cronTable } from '@/database/tables';
import dbRebaseline from '@/transport/cli/commands/db-rebaseline';

/**
 * A chain as `db:rebaseline` leaves one: a baseline of the `roles` table under
 * its `// ── roles ──` banner, with the journal and snapshot that match it.
 */
const BANNERED_BASELINE = join(import.meta.dirname, 'fixtures/bannered-baseline');

/** A migration that inserts a row into `roles`, which no snapshot can reproduce. */
const DATA_MIGRATION = join(import.meta.dirname, 'fixtures/seed-editor-role.ts.txt');

let site: string;
let migrations: string;

beforeEach(async () => {
    resetRuntime();
    site = await createTempSite();
    migrations = join(site, 'migrations');
});

/** Write a config naming the temp chain. */
function writeConfig(): Promise<string> {
    return writeSiteConfig(site, {
        database: join(site, 'database.db'),
        migrationsDir: migrations,
    });
}

/**
 * The bannered baseline, then, with `later`, one migration past it: `schema`
 * is the one `db:generate` writes for every other core table, which is schema
 * only and so collapsible; `data` is `0001_seed-editor-role`, which is not.
 */
async function bannerChain(options: { later?: 'schema' | 'data' } = {}): Promise<void> {
    await mkdir(migrations);
    await copyFile(
        join(BANNERED_BASELINE, '0000_baseline.ts.txt'),
        join(migrations, '0000_baseline.ts')
    );
    for (const file of ['journal.json', 'snapshot.json']) {
        await copyFile(join(BANNERED_BASELINE, file), join(migrations, file));
    }
    if (options.later === 'schema') {
        await generateMigrations({
            dir: migrations,
            tables: CORE_TABLES,
            dialect: 'sqlite',
            name: 'add-core-tables',
        });
    }
    if (options.later === 'data') {
        await copyFile(DATA_MIGRATION, join(migrations, '0001_seed-editor-role.ts'));
        const path = join(migrations, 'journal.json');
        const journal = JSON.parse(await readFile(path, 'utf-8')) as {
            entries: { idx: number; tag: string; when: number }[];
        };
        journal.entries.push({
            idx: 1,
            tag: '0001_seed-editor-role',
            when: 1788000000000,
        });
        await writeFile(path, JSON.stringify(journal));
    }
}

/** A baseline as `db:generate` writes it: every core table but `cron`. */
async function generatedBaseline(): Promise<void> {
    await generateMigrations({
        dir: migrations,
        tables: CORE_TABLES.filter((table) => table !== cronTable),
        dialect: 'sqlite',
        name: 'baseline',
    });
}

/** Every file under the temp chain with its contents, to show nothing changed. */
async function chainContents(): Promise<Record<string, string>> {
    const files = await readdir(migrations, { recursive: true, withFileTypes: true });
    const contents: Record<string, string> = {};
    for (const file of files.filter((entry) => entry.isFile())) {
        const path = join(file.parentPath, file.name);
        contents[path] = await readFile(path, 'utf-8');
    }
    return contents;
}

const coreNames = CORE_TABLES.map((table) => table.name).sort();

describe('db:rebaseline', () => {
    it('with --collapse, folds the chain into a baseline of the core tables', async () => {
        await bannerChain({ later: 'schema' });
        const config = await writeConfig();

        const { stdout, stderr, exitCode } = await run(dbRebaseline, [
            '--config',
            config,
            '--collapse',
        ]);

        expect(stderr).toEqual([]);
        expect(exitCode).toBe(0);
        expect((await readdir(migrations)).sort()).toEqual([
            '0000_baseline.ts',
            'index.ts',
            'journal.json',
            'snapshot.json',
        ]);
        const journal = JSON.parse(
            await readFile(join(migrations, 'journal.json'), 'utf-8')
        );
        expect(journal.entries.map((entry: { tag: string }) => entry.tag)).toEqual([
            '0000_baseline',
        ]);
        const index = await readFile(join(migrations, 'index.ts'), 'utf-8');
        expect(index).toContain("from './0000_baseline'");
        expect(index).not.toContain('0001_add-core-tables');

        const snapshot = JSON.parse(
            await readFile(join(migrations, 'snapshot.json'), 'utf-8')
        );
        expect(Object.keys(snapshot.tables).sort()).toEqual(coreNames);
        const baseline = await readFile(join(migrations, '0000_baseline.ts'), 'utf-8');
        for (const name of coreNames) expect(baseline).toContain(`// ── ${name} ──`);

        expect(stdout[0]).toContain(`rewrote ${join(migrations, '0000_baseline.ts')}`);
        expect(stdout).toContain(
            `[astromech db:rebaseline] deleted ${join(migrations, '0001_add-core-tables.ts')}`
        );
        expect(stdout.at(-1)).toContain('WARNING');
    });

    it('refuses a chain past the baseline without --collapse, changing nothing', async () => {
        await bannerChain({ later: 'schema' });
        const config = await writeConfig();
        const before = await chainContents();

        const { stderr, exitCode } = await run(dbRebaseline, ['--config', config]);

        expect(exitCode).toBe(1);
        expect(stderr).toEqual([
            expect.stringMatching(/^\[astromech db:rebaseline\] .*--collapse/),
        ]);
        expect(await chainContents()).toEqual(before);
    });

    it('refuses to collapse a migration that writes data, changing nothing', async () => {
        await bannerChain({ later: 'data' });
        const config = await writeConfig();
        const before = await chainContents();

        const { stderr, exitCode } = await run(dbRebaseline, [
            '--config',
            config,
            '--collapse',
        ]);

        expect(exitCode).toBe(1);
        expect(stderr).toEqual([expect.stringContaining('cannot collapse')]);
        expect(stderr[0]).toContain('0001_seed-editor-role.ts');
        expect(await chainContents()).toEqual(before);
    });

    it('rebaselines a baseline that db:generate wrote', async () => {
        await generatedBaseline();
        const config = await writeConfig();

        const { stderr, exitCode } = await run(dbRebaseline, ['--config', config]);

        expect(stderr).toEqual([]);
        expect(exitCode).toBe(0);
        const baseline = await readFile(join(migrations, '0000_baseline.ts'), 'utf-8');
        for (const name of coreNames) expect(baseline).toContain(`// ── ${name} ──`);
    });

    it('runs against a remote database without --allow-remote or opening it', async () => {
        await bannerChain();
        const config = await writeSiteConfig(site, {
            migrationsDir: migrations,
            remote: true,
            throwOnOpen: true,
        });

        const { stderr, exitCode } = await run(dbRebaseline, ['--config', config]);

        expect(stderr).toEqual([]);
        expect(exitCode).toBe(0);
    });
});
