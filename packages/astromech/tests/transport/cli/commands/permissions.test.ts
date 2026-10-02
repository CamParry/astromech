/**
 * `astromech permissions`: lists the permissions a role can be granted under
 * the config named by `--config`, as aligned text or as JSON.
 *
 * The config is a real file in a temp directory, loaded the way the CLI loads
 * one. Its database is an empty stand-in: the command never queries it.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetRuntime } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import permissions from '@/transport/cli/commands/permissions';

const CONFIG = `export default {
    db: { type: 'test', getInstance: () => ({}) },
    entries: {
        recipe: { single: 'Recipe', plural: 'Recipes', fields: [] },
    },
    globals: [{ key: 'site', label: 'Site', fields: [] }],
};
`;

let dir: string;
let configPath: string;
let printed: string[];
let errors: string[];

beforeEach(async () => {
    resetRuntime();
    dir = await mkdtemp(join(tmpdir(), 'astromech-cli-permissions-'));
    configPath = join(dir, 'astromech.config.mjs');
    await writeFile(configPath, CONFIG);
    printed = [];
    errors = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
        printed.push(String(line));
    });
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
        errors.push(String(line));
    });
});

afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = 0;
    await rm(dir, { recursive: true, force: true });
});

/** Run the command with `args`, as citty would after parsing them. */
async function run(args: Record<string, unknown>): Promise<void> {
    const runner = permissions.run as (context: { args: unknown }) => Promise<void>;
    await runner({
        args: { config: configPath, json: false, 'allow-remote': false, ...args },
    });
}

describe('permissions', () => {
    it('lists the config’s entry and global permissions, one aligned line each', async () => {
        await run({ filter: 'SITE' });

        // `global:site:update` is the longest string, so the others pad to it.
        expect(printed).toEqual([
            'global:site:publish  Publish "site" global  (site)',
            'global:site:read     Read "site" global  (site)',
            'global:site:update   Update "site" global  (site)',
        ]);
        expect(errors).toEqual([]);
    });

    it('narrows to one source, as JSON under --json', async () => {
        await run({ source: 'entry', json: true });

        const listed = JSON.parse(printed.join('\n')) as { permission: string }[];
        expect(listed.map((p) => p.permission)).toEqual([
            'entry:recipe:create',
            'entry:recipe:delete',
            'entry:recipe:publish',
            'entry:recipe:read',
            'entry:recipe:update',
        ]);
    });

    it('lists core permissions before the config’s own', async () => {
        await run({});

        const firstEntry = printed.findIndex((line) => line.startsWith('entry:'));
        expect(firstEntry).toBeGreaterThan(0);
        expect(
            printed.slice(0, firstEntry).every((line) => !line.includes(':recipe:'))
        ).toBe(true);
    });

    it('reports a config that cannot be loaded as the command’s error', async () => {
        await run({ config: join(dir, 'missing.config.mjs'), json: true });

        expect(printed).toEqual([]);
        expect(JSON.parse(errors.at(-1) ?? '{}')).toHaveProperty('error');
        expect(process.exitCode).toBe(1);
    });
});
