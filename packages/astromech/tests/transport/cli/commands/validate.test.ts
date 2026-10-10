/**
 * `astromech validate`: boots the site named by `--config`, prints one line per
 * stored row that fails the current field validation, and fails the process
 * only when there is one. `tests/content/validate-stored-content.test.ts`
 * covers which rows are found; this file covers what the command prints and its
 * exit code.
 *
 * A row is stored under a config with no rule, then the command runs under a
 * config file that adds one: the case the command exists for. The config file
 * is a real file in a temp site, loaded and booted the way the CLI boots one
 * (`tests/_support/cli.ts`), over a copy of the run's migrated test database.
 */

import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempSite, run, writeSiteConfig } from '@tests/cli';
import { makeTestConfig, resetRuntime, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { libsql } from '@/database/drivers/libsql';
import { getDb } from '@/database/registry';
import validate from '@/transport/cli/commands/validate';

let database: string;
let configPath: string;

beforeEach(async () => {
    resetRuntime();
    const siteDir = await createTempSite();
    database = join(siteDir, 'site.db');
    await copyFile(inject('testDbTemplate'), database);
    // `servings` is at most 8 here, a rule the stored row predates.
    configPath = await writeSiteConfig(siteDir, {
        database,
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
                        validation: [{ max: 8 }],
                    },
                ],
            },
            { type: 'note', single: 'Note', plural: 'Notes', fields: [] },
        ],
    });
});

afterEach(async () => {
    await getDb().destroy();
    resetRuntime();
});

/** Store a recipe for 12 under a config with no rule on `servings`; returns its id. */
async function storeLargeRecipe(): Promise<string> {
    setupTestConfig({
        ...makeTestConfig(),
        db: libsql({ url: `file:${database}` }),
        entries: [
            {
                type: 'recipe',
                single: 'Recipe',
                plural: 'Recipes',
                fields: [{ name: 'servings', type: 'number', label: 'Servings' }],
            },
        ],
    });
    const recipe = await currentServices.entries.create({
        type: 'recipe',
        data: { title: 'Feast', fields: { servings: 12 } },
    });
    await getDb().destroy();
    resetRuntime();
    return recipe.id;
}

describe('validate', () => {
    it('prints each failing row on stderr and sets exit code 1', async () => {
        const id = await storeLargeRecipe();

        const result = await run(validate, ['--config', configPath]);

        expect(result).toEqual({
            stdout: [],
            stderr: [
                '1 validation failure across 1 row checked.',
                `  entry recipe/${id} (en): servings — Must be at most 8`,
            ],
            exitCode: 1,
        });
    });

    it('reports every row valid, leaving the exit code alone, under --type', async () => {
        await storeLargeRecipe();

        const result = await run(validate, ['--config', configPath, '--type', 'note']);

        expect(result).toEqual({
            stdout: ['All rows valid (0 rows checked).'],
            stderr: [],
            exitCode: 0,
        });
    });
});
