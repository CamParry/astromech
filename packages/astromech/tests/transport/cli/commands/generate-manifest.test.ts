/**
 * `astromech generate:manifest`: loads the config file named by `--config` and
 * writes the method manifest for it to `--out`.
 *
 * The config is a real file in a temp site, loaded the way the CLI loads one
 * (`tests/_support/cli.ts`). Its database is an empty stand-in: the command
 * never queries it.
 */

import type { MethodManifest } from '@/types/index';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempSite, run, runOk, writeSiteConfig } from '@tests/cli';
import { resetRuntime } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import generateManifest from '@/transport/cli/commands/generate-manifest';

let siteDir: string;
let configPath: string;

beforeEach(async () => {
    resetRuntime();
    siteDir = await createTempSite();
    configPath = await writeSiteConfig(siteDir, {
        entries: {
            recipe: {
                single: 'Recipe',
                plural: 'Recipes',
                fields: [{ name: 'servings', type: 'number', label: 'Servings' }],
            },
        },
    });
});

describe('generate:manifest', () => {
    it('writes the manifest for the config’s entry types to --out', async () => {
        const out = join(siteDir, 'nested', 'methods.json');

        const result = await run(generateManifest, [
            '--config',
            configPath,
            '--out',
            out,
        ]);

        expect(result).toEqual({
            stdout: [`Manifest written to ${out}`],
            stderr: [],
            exitCode: 0,
        });
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
        const out = join(siteDir, 'methods.json');

        await runOk(generateManifest, ['--config', configPath, '--out', out]);
        const first = await readFile(out, 'utf-8');
        // Deleted, so the comparison reads what the second run wrote.
        await rm(out);
        resetRuntime();
        await runOk(generateManifest, ['--config', configPath, '--out', out]);

        expect(await readFile(out, 'utf-8')).toBe(first);
    });
});
