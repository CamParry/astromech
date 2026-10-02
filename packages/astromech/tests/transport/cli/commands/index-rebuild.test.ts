/**
 * `astromech index:rebuild`, run in process through the real boot: a config
 * file in a real temp directory opens a copy of the harness's migrated template
 * database with a libsql driver built inline from `kysely` and
 * `@libsql/kysely-libsql` (resolved through a `node_modules` symlink to core's),
 * the way core's `libsql` driver builds one. Rebuild and
 * drift logic is covered by `../relationship-index.test.ts`; this file covers
 * what the command does with it: what it writes, prints and exits with.
 */

import { copyFile, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetRuntime } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { getDb } from '@/database/registry';
import { relationshipsTable } from '@/database/tables';
import indexRebuild from '@/transport/cli/commands/index-rebuild';
import { bootApplication } from '@/transport/cli/config';

/** Core's installed dependencies, which the temp site's config imports. */
const NODE_MODULES = join(import.meta.dirname, '../../../../node_modules');

let root: string;
let printed: string[];
let errors: string[];

beforeEach(async () => {
    resetRuntime();
    root = await mkdtemp(join(tmpdir(), 'astromech-index-rebuild-'));
    await copyFile(inject('testDbTemplate'), join(root, 'site.db'));
    await symlink(NODE_MODULES, join(root, 'node_modules'), 'dir');
    printed = [];
    errors = [];
});

afterEach(async () => {
    vi.restoreAllMocks();
    resetRuntime();
    process.exitCode = 0;
    await rm(root, { recursive: true, force: true });
});

/**
 * A site config with two types that relate to `post`. `migrationsDir` names a
 * folder with no chain, so boot skips the drift check the template would pass.
 */
async function writeConfig(options: { remote?: boolean } = {}): Promise<string> {
    const file = join(root, 'astromech.config.mjs');
    const url = `file:${join(root, 'site.db')}`;
    const related = `{ name: 'related', type: 'relationship', label: 'Related', target: 'post', multiple: true }`;
    await writeFile(
        file,
        `import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { CamelCasePlugin, Kysely } from 'kysely';

let instance;
export default {
    db: {
        type: 'libsql',
        isRemote: () => ${options.remote === true},
        getInstance() {
            instance ??= new Kysely({
                dialect: new LibsqlDialect({ client: createClient({ url: ${JSON.stringify(url)} }) }),
                plugins: [new CamelCasePlugin()],
            });
            return instance;
        },
    },
    migrationsDir: ${JSON.stringify(join(root, 'no-migrations'))},
    entries: {
        post: { single: 'Post', plural: 'Posts', fields: [${related}] },
        note: { single: 'Note', plural: 'Notes', fields: [${related}] },
    },
};
`
    );
    return file;
}

/** Run the command with `args`, as citty would after parsing them. */
async function run(args: Record<string, unknown>): Promise<void> {
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
        printed.push(String(line));
    });
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
        errors.push(String(line));
    });
    const runner = indexRebuild.run as (context: { args: unknown }) => Promise<void>;
    try {
        await runner({
            args: { json: false, 'allow-remote': false, check: false, ...args },
        });
    } finally {
        vi.restoreAllMocks();
    }
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

        await run({ config });

        expect(errors).toEqual([]);
        expect(printed).toEqual([
            'Rebuilt the relationships index: 3 sources scanned, 2 rows written, 0 orphan rows removed.',
        ]);
        expect(await usedByTypes(target)).toEqual(['note', 'post']);
    });

    it('rebuilds only the --type it is given', async () => {
        const config = await writeConfig();
        const { target } = await seedThenEmptyIndex(config);

        await run({ config, type: 'note' });

        expect(errors).toEqual([]);
        expect(await usedByTypes(target)).toEqual(['note']);
    });

    it('with --check, lists the drift and exits 1 without writing', async () => {
        const config = await writeConfig();
        const { target } = await seedThenEmptyIndex(config);

        await run({ config, check: true });

        expect(process.exitCode).toBe(1);
        expect(errors[0]).toBe(
            'Relationships index drift across 3 sources: 2 missing, 0 unexpected, 0 mismatched.'
        );
        expect(errors.filter((line) => line.startsWith('  missing '))).toHaveLength(2);
        expect(errors.at(-1)).toBe('Run `astromech index:rebuild` to repair.');
        expect(await usedByTypes(target)).toEqual([]);

        await run({ config });
        process.exitCode = 0;
        errors = [];

        await run({ config, check: true });
        expect(errors).toEqual([]);
        expect(process.exitCode).toBe(0);
        expect(printed.at(-1)).toBe(
            'Relationships index is in sync (3 sources scanned).'
        );
    });

    it('refuses a remote database without --allow-remote, before opening it', async () => {
        const config = await writeConfig({ remote: true });
        const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`exit:${code}`);
        }) as never);

        await run({ config, json: true });

        expect(exit).toHaveBeenCalledWith(1);
        expect(errors[0]).toContain('refusing to open the "libsql" database');
        expect(errors[0]).toContain('--allow-remote');
        expect(process.exitCode).toBe(1);
    });
});
