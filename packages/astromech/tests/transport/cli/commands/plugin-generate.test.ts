/**
 * `astromech plugin:generate`, run in process (`tests/_support/cli.ts`) against
 * a plugin package laid out in a temp directory. The tables module declares its
 * table with core's `defineTable`, imported from source by absolute path:
 * `definePluginTable`'s own imports go through the `@/` alias, which the
 * command's loader cannot resolve, so the module writes the prefixed name
 * `definePluginTable` derives.
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTempSite, run } from '@tests/cli';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import pluginGenerate from '@/transport/cli/commands/plugin-generate';

/** Core's `defineTable` source, which imports nothing through the `@/` alias. */
const DEFINE_TABLE = pathToFileURL(
    join(import.meta.dirname, '../../../../src/database/define-table.ts')
).href;

let root: string;

beforeEach(async () => {
    root = await createTempSite();
});

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

        expect(await run(pluginGenerate, ['--name', 'init'])).toEqual({
            stdout: ['[astromech plugin:generate] generated ./migrations/0000_init.ts'],
            stderr: [],
            exitCode: 0,
        });
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

        expect(await run(pluginGenerate, ['--name', 'again'])).toEqual({
            stdout: ['[astromech plugin:generate] no changes'],
            stderr: [],
            exitCode: 0,
        });
        expect((await readdir(dir)).sort()).toEqual([
            '0000_init.ts',
            'index.ts',
            'journal.json',
            'snapshot.json',
        ]);
    });

    it('refuses a table outside the package’s prefix, writing nothing', async () => {
        const tables = await writeTables('plugin_acme_other_links');
        const dir = join(root, 'migrations');

        const { stderr, exitCode } = await run(pluginGenerate, [
            '--package',
            '@acme/seo',
            '--tables',
            tables,
            '--dir',
            dir,
        ]);

        expect(exitCode).toBe(1);
        expect(stderr).toEqual([expect.stringContaining('"plugin_acme_seo_"')]);
        expect(stderr[0]).toContain('plugin_acme_other_links');
        await expect(readdir(dir)).rejects.toThrow('ENOENT');
    });

    it('refuses a module that exports no tables', async () => {
        const tables = join(root, 'empty.ts');
        await writeFile(tables, 'export const notATable = { name: 1 };\n');

        const { stderr, exitCode } = await run(pluginGenerate, [
            '--package',
            '@acme/seo',
            '--tables',
            tables,
            '--dir',
            join(root, 'migrations'),
        ]);

        expect(exitCode).toBe(1);
        expect(stderr).toEqual([
            expect.stringContaining(`no tables exported from ${tables}`),
        ]);
    });

    it('refuses to guess a package name when there is no package.json', async () => {
        vi.spyOn(process, 'cwd').mockReturnValue(root);

        const { stderr, exitCode } = await run(pluginGenerate, []);

        expect(exitCode).toBe(1);
        expect(stderr).toEqual([
            expect.stringContaining('could not read a package name'),
        ]);
        expect(stderr[0]).toContain('--package');
    });
});
