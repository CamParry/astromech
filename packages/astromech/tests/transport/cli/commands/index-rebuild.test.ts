/**
 * `astromech index:rebuild`, run in process (`tests/_support/cli.ts`) through
 * the real boot: a real config file in a site in a temp directory opens a copy
 * of the harness's migrated template database. Rebuild and drift logic is
 * covered by `../relationship-index.test.ts`; this file covers what the
 * command does with it: what it writes, prints and exits with.
 */

import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempSite, run, runOk, writeSiteConfig } from '@tests/cli';
import { resetRuntime } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { getDb } from '@/database/registry';
import { relationshipsTable } from '@/database/tables';
import indexRebuild from '@/transport/cli/commands/index-rebuild';
import { bootApplication } from '@/transport/cli/config';

let root: string;

beforeEach(async () => {
    resetRuntime();
    root = await createTempSite();
    await copyFile(inject('testDbTemplate'), join(root, 'site.db'));
});

afterEach(async () => {
    try {
        await getDb().destroy();
    } catch {
        // A refused run never registered a database.
    }
});

/**
 * A site config with two types that relate to `post`. `migrationsDir` names a
 * folder with no chain, so boot skips the drift check the template would pass.
 * A remote driver throws if it is opened, so a refusal is seen to come first.
 */
function writeConfig(options: { remote?: boolean } = {}): Promise<string> {
    const related = {
        name: 'related',
        type: 'relationship',
        label: 'Related',
        target: 'post',
        multiple: true,
    };
    return writeSiteConfig(root, {
        database: join(root, 'site.db'),
        migrationsDir: join(root, 'no-migrations'),
        entries: {
            post: { single: 'Post', plural: 'Posts', fields: [related] },
            note: { single: 'Note', plural: 'Notes', fields: [related] },
        },
        remote: options.remote === true,
        throwOnOpen: options.remote === true,
    });
}

/**
 * Boot the site, then write a post, and a post and a note that each reference
 * it, through the services. Then empty the relationships index, as a crash or a
 * hand edit might leave it, and clear the runtime so the command boots afresh.
 */
async function seedThenEmptyIndex(config: string): Promise<{ target: string }> {
    await bootApplication(config);
    const target = await currentServices.entries.create({
        type: 'post',
        data: { title: 'Target' },
    });
    for (const type of ['post', 'note']) {
        await currentServices.entries.create({
            type,
            data: { title: `From ${type}`, fields: { related: [target.id] } },
        });
    }
    expect(await usedByTypes(target.id)).toEqual(['note', 'post']);

    await getDb().deleteFrom(relationshipsTable.name).execute();
    expect(await usedByTypes(target.id)).toEqual([]);
    resetRuntime();
    return { target: target.id };
}

/** The source types the public read path lists as using `id`. */
async function usedByTypes(id: string): Promise<string[]> {
    const usage = await currentServices.entries.usedBy({ type: 'post', id });
    return usage.map((row) => row.sourceType ?? row.sourceKind).sort();
}

describe('index:rebuild', () => {
    it('restores the index from field data and reports what it wrote', async () => {
        const config = await writeConfig();
        const { target } = await seedThenEmptyIndex(config);

        expect(await run(indexRebuild, ['--config', config])).toEqual({
            stdout: [
                'Rebuilt the relationships index: 3 sources scanned, 2 rows written, 0 orphan rows removed.',
            ],
            stderr: [],
            exitCode: 0,
        });
        expect(await usedByTypes(target)).toEqual(['note', 'post']);
    });

    it('rebuilds only the --type it is given', async () => {
        const config = await writeConfig();
        const { target } = await seedThenEmptyIndex(config);

        const { stderr, exitCode } = await run(indexRebuild, [
            '--config',
            config,
            '--type',
            'note',
        ]);

        expect(stderr).toEqual([]);
        expect(exitCode).toBe(0);
        expect(await usedByTypes(target)).toEqual(['note']);
    });

    it('with --check, lists the drift and exits 1 without writing', async () => {
        const config = await writeConfig();
        const { target } = await seedThenEmptyIndex(config);

        const drift = await run(indexRebuild, ['--config', config, '--check']);

        expect(drift.exitCode).toBe(1);
        expect(drift.stderr[0]).toBe(
            'Relationships index drift across 3 sources: 2 missing, 0 unexpected, 0 mismatched.'
        );
        expect(drift.stderr.filter((line) => line.startsWith('  missing '))).toHaveLength(
            2
        );
        expect(drift.stderr.at(-1)).toBe('Run `astromech index:rebuild` to repair.');
        expect(await usedByTypes(target)).toEqual([]);

        await runOk(indexRebuild, ['--config', config]);

        expect(await run(indexRebuild, ['--config', config, '--check'])).toEqual({
            stdout: ['Relationships index is in sync (3 sources scanned).'],
            stderr: [],
            exitCode: 0,
        });
    });

    it('refuses a remote database without --allow-remote, before opening it', async () => {
        const config = await writeConfig({ remote: true });

        const { stdout, stderr, exitCode } = await run(indexRebuild, [
            '--config',
            config,
            '--json',
        ]);

        expect(exitCode).toBe(1);
        expect(stdout).toEqual([]);
        expect(stderr).toEqual([
            expect.stringContaining('refusing to open the "libsql" database'),
        ]);
        expect(stderr[0]).toContain('--allow-remote');
        expect(() => getDb()).toThrow();
    });
});
