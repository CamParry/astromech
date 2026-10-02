/**
 * `astromech validate`: boots the site named by `--config`, prints one line per
 * stored row that fails the current field validation, and fails the process
 * only when there is one. `validate-stored-content.test.ts` covers which rows
 * are found; this file covers what the command prints and its exit code.
 *
 * A row is stored under a config with no rule, then the command runs under a
 * config file that adds one: the case the command exists for. The config file
 * builds its own libsql Kysely from absolute paths, because a file outside the
 * package cannot resolve Astromech's modules or its dependencies by name.
 */

import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTestConfig, resetRuntime, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { libsql } from '@/database/drivers/libsql';
import validate from '@/transport/cli/commands/validate';

const require = createRequire(import.meta.url);

/** A config file over the libsql database at `dbFile`, with `servings` at most 8. */
function configSource(dbFile: string): string {
    const path = (id: string) => JSON.stringify(require.resolve(id));
    return `const { createClient } = require(${path('@libsql/client')});
const { LibsqlDialect } = require(${path('@libsql/kysely-libsql')});
const { CamelCasePlugin, Kysely } = require(${path('kysely')});

const db = new Kysely({
    dialect: new LibsqlDialect({ client: createClient({ url: ${JSON.stringify(`file:${dbFile}`)} }) }),
    plugins: [new CamelCasePlugin()],
});

module.exports = {
    db: { type: 'libsql', getInstance: () => db },
    entries: {
        recipe: {
            single: 'Recipe',
            plural: 'Recipes',
            fields: [
                { name: 'servings', type: 'number', label: 'Servings', validation: [{ max: 8 }] },
            ],
        },
        note: { single: 'Note', plural: 'Notes', fields: [] },
    },
};
`;
}

let dir: string;
let dbFile: string;
let configPath: string;
let printed: string[];
let errors: string[];

beforeEach(async () => {
    resetRuntime();
    dir = await mkdtemp(join(tmpdir(), 'astromech-cli-validate-'));
    dbFile = join(dir, 'site.db');
    await copyFile(inject('testDbTemplate'), dbFile);
    configPath = join(dir, 'astromech.config.cjs');
    await writeFile(configPath, configSource(dbFile));
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
    resetRuntime();
    process.exitCode = 0;
    await rm(dir, { recursive: true, force: true });
});

/** Store a recipe for 12 under a config with no rule on `servings`; returns its id. */
async function storeLargeRecipe(): Promise<string> {
    setupTestConfig({
        ...makeTestConfig(),
        db: libsql({ url: `file:${dbFile}` }),
        entries: {
            recipe: {
                single: 'Recipe',
                plural: 'Recipes',
                fields: [{ name: 'servings', type: 'number', label: 'Servings' }],
            },
        },
    });
    const recipe = await currentServices.entries.create({
        type: 'recipe',
        data: { title: 'Feast', fields: { servings: 12 } },
    });
    resetRuntime();
    return recipe.id;
}

/** Run the command with `args`, as citty would after parsing them. */
async function run(args: Record<string, unknown>): Promise<void> {
    const runner = validate.run as (context: { args: unknown }) => Promise<void>;
    await runner({ args: { config: configPath, 'allow-remote': false, ...args } });
}

describe('validate', () => {
    it('prints each failing row on stderr and sets exit code 1', async () => {
        const id = await storeLargeRecipe();

        await run({});

        expect(printed).toEqual([]);
        expect(errors).toEqual([
            '1 validation failures across 1 rows checked.',
            `  entry recipe/${id} (en): servings — Must be at most 8`,
        ]);
        expect(process.exitCode).toBe(1);
    });

    it('reports every row valid, leaving the exit code alone, under --type', async () => {
        await storeLargeRecipe();

        await run({ type: 'note' });

        expect(printed).toEqual(['All rows valid (0 rows checked).']);
        expect(errors).toEqual([]);
        expect(process.exitCode).not.toBe(1);
    });
});
