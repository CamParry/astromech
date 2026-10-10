/**
 * `astromech generate:types`: loads the config file named by `--config` and
 * writes the client type declarations for it to `--out`.
 *
 * The config is a real file in a temp site, loaded the way the CLI loads one
 * (`tests/_support/cli.ts`). Its database is an empty stand-in: the command
 * never queries it.
 */

import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempSite, run, runOk, writeSiteConfig } from '@tests/cli';
import { resetRuntime } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import generateTypes from '@/transport/cli/commands/generate-types';

let siteDir: string;
let configPath: string;

beforeEach(async () => {
    resetRuntime();
    siteDir = await createTempSite();
    configPath = await writeSiteConfig(siteDir, {
        entries: [
            {
                type: 'recipe',
                single: 'Recipe',
                plural: 'Recipes',
                fields: [
                    {
                        name: 'servings',
                        type: 'number',
                        label: 'Servings',
                        required: true,
                    },
                ],
            },
        ],
        globals: [
            {
                key: 'site',
                label: 'Site',
                fields: [{ name: 'tagline', type: 'text', label: 'Tagline' }],
            },
        ],
    });
});

describe('generate:types', () => {
    it('writes declarations for the config’s entry types and globals to --out', async () => {
        const out = join(siteDir, 'nested', 'astromech.d.ts');

        const result = await run(generateTypes, ['--config', configPath, '--out', out]);

        expect(result).toEqual({
            stdout: [`Types written to ${out}`],
            stderr: [],
            exitCode: 0,
        });
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
        const out = join(siteDir, 'astromech.d.ts');

        await runOk(generateTypes, ['--config', configPath, '--out', out]);
        const first = await readFile(out, 'utf-8');
        // Deleted, so the comparison reads what the second run wrote.
        await rm(out);
        resetRuntime();
        await runOk(generateTypes, ['--config', configPath, '--out', out]);

        expect(await readFile(out, 'utf-8')).toBe(first);
    });

    it('runs against a remote database without --allow-remote or opening it', async () => {
        const config = await writeSiteConfig(siteDir, {
            remote: true,
            throwOnOpen: true,
        });
        const out = join(siteDir, 'astromech.d.ts');

        expect(await run(generateTypes, ['--config', config, '--out', out])).toEqual({
            stdout: [`Types written to ${out}`],
            stderr: [],
            exitCode: 0,
        });
    });
});
