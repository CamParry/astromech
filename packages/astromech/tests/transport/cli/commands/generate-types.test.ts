/**
 * `astromech generate:types`: loads the config file named by `--config` and
 * writes the client type declarations for it to `--out`.
 *
 * The config is a real file in a temp directory, loaded the way the CLI loads
 * one. Its database is an empty stand-in: the command never queries it.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetRuntime } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import generateTypes from '@/transport/cli/commands/generate-types';

const CONFIG = `export default {
    db: { type: 'test', getInstance: () => ({}) },
    entries: {
        recipe: {
            single: 'Recipe',
            plural: 'Recipes',
            fields: [{ name: 'servings', type: 'number', label: 'Servings', required: true }],
        },
    },
    globals: [
        { key: 'site', label: 'Site', fields: [{ name: 'tagline', type: 'text', label: 'Tagline' }] },
    ],
};
`;

let dir: string;
let configPath: string;
let printed: string[];

beforeEach(async () => {
    resetRuntime();
    dir = await mkdtemp(join(tmpdir(), 'astromech-cli-types-'));
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
    const runner = generateTypes.run as (context: { args: unknown }) => Promise<void>;
    await runner({ args: { config: configPath, 'allow-remote': false, ...args } });
}

describe('generate:types', () => {
    it('writes declarations for the config’s entry types and globals to --out', async () => {
        const out = join(dir, 'nested', 'astromech.d.ts');

        await run({ out });

        expect(printed).toEqual([`Types written to ${out}`]);
        const lines = (await readFile(out, 'utf-8')).split('\n').map((l) => l.trim());
        expect(lines).toContain("declare module 'astromech' {");
        expect(lines).toContain(
            'recipe: { fields: RecipeFields; fieldsPublic: RecipeFieldsPublic; relations: RecipeRelations };'
        );
        expect(lines).toContain('site: { fields: SiteGlobalFields };');
        // A required field is non-optional; an optional one carries `?`.
        expect(lines).toContain('servings: number;');
        expect(lines).toContain('tagline?: string;');
    });

    it('writes the same bytes when run twice', async () => {
        const out = join(dir, 'astromech.d.ts');

        await run({ out });
        const first = await readFile(out, 'utf-8');
        resetRuntime();
        await run({ out });

        expect(await readFile(out, 'utf-8')).toBe(first);
    });
});
