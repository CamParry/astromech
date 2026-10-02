/**
 * `astromech db:rebaseline`, run in process against a migration chain in a real
 * temp directory, through a config file the command loads the way it loads a
 * site's.
 */

import {
    copyFile,
    cp,
    mkdtemp,
    readdir,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetRuntime } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMigrations } from '@/database/generate';
import { CORE_TABLES, cronTable } from '@/database/tables';
import dbRebaseline from '@/transport/cli/commands/db-rebaseline';

/**
 * The demo app's chain: a baseline with a `// ── <table> ──` banner per table,
 * as `db:rebaseline` writes one, and eight migrations past it that write data.
 */
const DEMO_MIGRATIONS = join(
    import.meta.dirname,
    '../../../../../../apps/demo/migrations'
);

let root: string;
let migrations: string;
let printed: string[];
let errors: string[];

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'astromech-db-rebaseline-'));
    migrations = join(root, 'migrations');
    printed = [];
    errors = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
        printed.push(String(line));
    });
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
        errors.push(String(line));
    });
    // A refusal calls `process.exit`; throwing makes it observable and stops the run.
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
    }) as never);
});

afterEach(async () => {
    vi.restoreAllMocks();
    // `loadConfig` registers the temp config's drivers.
    resetRuntime();
    await rm(root, { recursive: true, force: true });
});

/** Write a config naming the temp chain, with a database that is remote or local. */
async function writeConfig(options: { remote?: boolean } = {}): Promise<string> {
    const file = join(root, 'astromech.config.mjs');
    await writeFile(
        file,
        `export default {
            db: {
                type: 'libsql',
                isRemote: () => ${options.remote === true},
                getInstance: () => ({}),
            },
            migrationsDir: ${JSON.stringify(migrations)},
            entries: {},
        };`
    );
    return file;
}

/**
 * A chain as `db:generate` writes it: a baseline of every core table but
 * `cron`, then, with `later`, a migration creating `cron`, which is schema only
 * and so collapsible.
 */
async function generateChain(options: { later: boolean }): Promise<void> {
    await generateMigrations({
        dir: migrations,
        tables: CORE_TABLES.filter((table) => table !== cronTable),
        dialect: 'sqlite',
        name: 'baseline',
    });
    if (options.later) {
        await generateMigrations({
            dir: migrations,
            tables: CORE_TABLES,
            dialect: 'sqlite',
            name: 'add-cron',
        });
    }
}

/**
 * The same chain with the demo's bannered baseline in place of the generated
 * one, since the command refuses a baseline without banners (see the
 * `it.fails` case below).
 */
async function bannerChain(options: { later: boolean }): Promise<void> {
    await generateChain(options);
    await copyFile(
        join(DEMO_MIGRATIONS, '0000_baseline.ts'),
        join(migrations, '0000_baseline.ts')
    );
}

/** Run the command with `args`, as citty would after parsing them. */
async function run(args: Record<string, unknown>): Promise<void> {
    const runner = dbRebaseline.run as (context: { args: unknown }) => Promise<void>;
    await runner({ args: { 'allow-remote': false, ...args } });
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
        await bannerChain({ later: true });
        const config = await writeConfig();

        await run({ config, collapse: true });

        expect(errors).toEqual([]);
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
        expect(index).not.toContain('0001_add-cron');

        const snapshot = JSON.parse(
            await readFile(join(migrations, 'snapshot.json'), 'utf-8')
        );
        expect(Object.keys(snapshot.tables).sort()).toEqual(coreNames);
        const baseline = await readFile(join(migrations, '0000_baseline.ts'), 'utf-8');
        for (const name of coreNames) expect(baseline).toContain(`// ── ${name} ──`);

        expect(printed[0]).toContain(`rewrote ${join(migrations, '0000_baseline.ts')}`);
        expect(printed).toContain(
            `[astromech db:rebaseline] deleted ${join(migrations, '0001_add-cron.ts')}`
        );
        expect(printed.at(-1)).toContain('WARNING');
    });

    it('refuses a chain past the baseline without --collapse, changing nothing', async () => {
        await bannerChain({ later: true });
        const config = await writeConfig();
        const before = await chainContents();

        await expect(run({ config })).rejects.toThrow('exit:1');

        expect(errors[0]).toMatch(/^\[astromech db:rebaseline\] .*--collapse/);
        expect(await chainContents()).toEqual(before);
    });

    it('refuses to collapse a migration that writes data, changing nothing', async () => {
        await cp(DEMO_MIGRATIONS, migrations, { recursive: true });
        const config = await writeConfig();
        const before = await chainContents();

        await expect(run({ config, collapse: true })).rejects.toThrow('exit:1');

        expect(errors[0]).toContain('cannot collapse');
        expect(errors[0]).toContain('0001_entry_content.ts');
        expect(await chainContents()).toEqual(before);
    });

    it('refuses a remote database unless --allow-remote is passed', async () => {
        await bannerChain({ later: false });
        const config = await writeConfig({ remote: true });
        const before = await chainContents();

        await expect(run({ config })).rejects.toThrow('exit:1');
        expect(errors[0]).toContain('--allow-remote');
        expect(await chainContents()).toEqual(before);

        await run({ config, 'allow-remote': true });
        const snapshot = JSON.parse(
            await readFile(join(migrations, 'snapshot.json'), 'utf-8')
        );
        expect(Object.keys(snapshot.tables).sort()).toEqual(coreNames);
    });

    // DEFECT: `db:generate` writes a baseline with no `// ── <table> ──`
    // banners, and `db:rebaseline` refuses any baseline without them ("the
    // statement … sits before the first banner"). So a site whose chain
    // `db:generate` started cannot rebaseline it without hand-adding a banner
    // per table. Remove `.fails` once the two agree.
    it.fails('rebaselines a baseline that db:generate wrote', async () => {
        await generateChain({ later: false });
        const config = await writeConfig();

        await run({ config });

        expect(errors).toEqual([]);
    });
});
