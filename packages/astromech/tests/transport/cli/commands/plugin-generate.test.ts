/**
 * `astromech plugin:generate`, run in process against a plugin package laid out
 * in a real temp directory. The tables module declares its table with core's
 * `defineTable`, imported from source by absolute path: `definePluginTable`'s
 * own imports go through the `@/` alias, which the command's loader cannot
 * resolve, so the module writes the prefixed name `definePluginTable` derives.
 */

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pluginGenerate from '@/transport/cli/commands/plugin-generate';

/** Core's `defineTable` source, which imports nothing through the `@/` alias. */
const DEFINE_TABLE = pathToFileURL(
    join(import.meta.dirname, '../../../../src/database/define-table.ts')
).href;

let root: string;
let printed: string[];
let errors: string[];

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'astromech-plugin-generate-'));
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
    await rm(root, { recursive: true, force: true });
});

/** Run the command with `args`, as citty would after parsing them. */
async function run(args: Record<string, unknown>): Promise<void> {
    const runner = pluginGenerate.run as (context: { args: unknown }) => Promise<void>;
    await runner({
        args: {
            tables: './src/tables/index.ts',
            name: 'migration',
            dir: './migrations',
            ...args,
        },
    });
}

/** Write a tables module declaring one table named `name`, and return its path. */
async function writeTables(name: string, file = 'src/tables/index.ts'): Promise<string> {
    const path = join(root, file);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(
        path,
        `import { defineTable } from '${DEFINE_TABLE}';
export const links = defineTable('${name}', ({ col }) => ({
    id: col.id(),
    url: col.text({ notNull: true }),
}));
`
    );
    return path;
}

describe('plugin:generate', () => {
    it('writes a migration from the package root, then reports no changes', async () => {
        await writeFile(join(root, 'package.json'), '{ "name": "@acme/seo" }');
        await writeTables('plugin_acme_seo_links');
        vi.spyOn(process, 'cwd').mockReturnValue(root);

        await run({ name: 'init' });

        expect(printed).toEqual([
            '[astromech plugin:generate] generated ./migrations/0000_init.ts',
        ]);
        const dir = join(root, 'migrations');
        expect((await readdir(dir)).sort()).toEqual([
            '0000_init.ts',
            'index.ts',
            'journal.json',
            'snapshot.json',
        ]);
        expect(await readFile(join(dir, '0000_init.ts'), 'utf-8')).toContain(
            'plugin_acme_seo_links'
        );
        const snapshot = JSON.parse(await readFile(join(dir, 'snapshot.json'), 'utf-8'));
        expect(Object.keys(snapshot.tables)).toEqual(['plugin_acme_seo_links']);

        await run({ name: 'again' });

        expect(printed.at(-1)).toBe('[astromech plugin:generate] no changes');
        expect((await readdir(dir)).sort()).toEqual([
            '0000_init.ts',
            'index.ts',
            'journal.json',
            'snapshot.json',
        ]);
        expect(errors).toEqual([]);
    });

    it('refuses a table outside the package’s prefix, writing nothing', async () => {
        const tables = await writeTables('plugin_acme_other_links');
        const dir = join(root, 'migrations');

        await expect(run({ package: '@acme/seo', tables, dir })).rejects.toThrow(
            'exit:1'
        );

        expect(errors[0]).toContain('"plugin_acme_seo_"');
        expect(errors[0]).toContain('plugin_acme_other_links');
        await expect(readdir(dir)).rejects.toThrow('ENOENT');
    });

    it('refuses a module that exports no tables', async () => {
        const tables = join(root, 'empty.ts');
        await writeFile(tables, 'export const notATable = { name: 1 };\n');

        await expect(
            run({ package: '@acme/seo', tables, dir: join(root, 'migrations') })
        ).rejects.toThrow('exit:1');

        expect(errors[0]).toContain(`no tables exported from ${tables}`);
    });

    it('refuses to guess a package name when there is no package.json', async () => {
        vi.spyOn(process, 'cwd').mockReturnValue(root);

        await expect(run({})).rejects.toThrow('exit:1');

        expect(errors[0]).toContain('could not read a package name');
        expect(errors[0]).toContain('--package');
    });
});
