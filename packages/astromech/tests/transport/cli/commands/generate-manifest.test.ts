/**
 * `astromech generate:manifest`: loads the config file named by `--config` and
 * writes the method manifest for it to `--out`.
 *
 * The config is a real file in a temp directory, loaded the way the CLI loads
 * one. Its database is an empty stand-in: the command never queries it.
 */

import type { MethodManifest } from '@/types/index';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetRuntime } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import generateManifest from '@/transport/cli/commands/generate-manifest';

const CONFIG = `export default {
    db: { type: 'test', getInstance: () => ({}) },
    entries: {
        recipe: {
            single: 'Recipe',
            plural: 'Recipes',
            fields: [{ name: 'servings', type: 'number', label: 'Servings' }],
        },
    },
};
`;

let dir: string;
let configPath: string;
let printed: string[];

beforeEach(async () => {
    resetRuntime();
    dir = await mkdtemp(join(tmpdir(), 'astromech-cli-manifest-'));
    configPath = join(dir, 'astromech.config.mjs');
    await writeFile(configPath, CONFIG);
    printed = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
        printed.push(String(line));
    });
});

afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
});

/** Run the command with `args`, as citty would after parsing them. */
async function run(args: Record<string, unknown>): Promise<void> {
    const runner = generateManifest.run as (context: { args: unknown }) => Promise<void>;
    await runner({ args: { config: configPath, 'allow-remote': false, ...args } });
}

describe('generate:manifest', () => {
    it('writes the manifest for the config’s entry types to --out', async () => {
        const out = join(dir, 'nested', 'methods.json');

        await run({ out });

        expect(printed).toEqual([`Manifest written to ${out}`]);
        const manifest = JSON.parse(await readFile(out, 'utf-8')) as MethodManifest;
        const recipeCreate = manifest.methods.find(
            (m) =>
                m.source === 'entries' && m.typeId === 'recipe' && m.method === 'create'
        );
        expect(recipeCreate).toMatchObject({
            mutates: true,
            permission: 'entry:recipe:create',
        });
        expect(manifest.methods.some((m) => m.id === 'users.create')).toBe(true);
        expect(manifest.methods.some((m) => m.id.startsWith('entries.post.'))).toBe(
            false
        );
    });

    it('writes the same bytes when run twice', async () => {
        const out = join(dir, 'methods.json');

        await run({ out });
        const first = await readFile(out, 'utf-8');
        resetRuntime();
        await run({ out });

        expect(await readFile(out, 'utf-8')).toBe(first);
    });
});
