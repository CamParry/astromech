/**
 * `astromech methods`: boots the site named by `--config` and lists the
 * methods its manifest offers, narrowed by the view and surface filters.
 *
 * The config is a real file in a temp directory, loaded and booted the way the
 * CLI boots one, over a copy of the run's migrated test database. It builds
 * its own libsql Kysely from absolute paths, because a file outside the package
 * cannot resolve Astromech's modules or its dependencies by name.
 */

import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetRuntime } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import methods from '@/transport/cli/commands/methods';

const require = createRequire(import.meta.url);

/** A config file over the libsql database at `dbFile`. */
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
        recipe: { single: 'Recipe', plural: 'Recipes', fields: [] },
    },
    roles: { reader: { name: 'Reader', permissions: ['entry:recipe:read'] } },
};
`;
}

let dir: string;
let configPath: string;
let printed: string[];
let errors: string[];

beforeEach(async () => {
    resetRuntime();
    dir = await mkdtemp(join(tmpdir(), 'astromech-cli-methods-'));
    const dbFile = join(dir, 'site.db');
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

/** Run the command with `args`, as citty would after parsing them. */
async function run(args: Record<string, unknown>): Promise<void> {
    const runner = methods.run as (context: { args: unknown }) => Promise<void>;
    await runner({
        args: {
            config: configPath,
            json: false,
            'allow-remote': false,
            'read-only': false,
            ...args,
        },
    });
}

describe('methods', () => {
    it('lists each method of a source with its effects and permission', async () => {
        await run({ source: 'entries' });

        expect(printed).toContain(
            'entries.create  [mutates]  (permission: entry:recipe:create)'
        );
        expect(printed).toContain(
            'entries.delete  [mutates destructive]  (permission: entry:recipe:delete)'
        );
        expect(printed).toContain('entries.get  (permission: entry:recipe:read)');
        expect(printed.every((line) => line.startsWith('entries.'))).toBe(true);
        expect(errors).toEqual([]);
    });

    it('marks what a role may not call, or may depending on the target, under --role', async () => {
        await run({ role: 'reader' });

        expect(printed).toContain('entries.get  (permission: entry:recipe:read)');
        expect(printed).toContain(
            'entries.create  [mutates denied]  (permission: entry:recipe:create)'
        );
        expect(printed).toContain('globals.get  [depends]  (permission: dynamic)');
        expect(printed).toContain('notifications.count  (permission: none)');
        expect(errors).toEqual([]);
    });

    it('lists only what --read-only keeps, and counts what it excluded', async () => {
        await run({ source: 'entries', 'read-only': true });

        expect(printed).toEqual([
            'entries.get  (permission: entry:recipe:read)',
            'entries.query  (permission: entry:recipe:read)',
            'entries.usedBy  (permission: entry:recipe:read)',
            '\n10 excluded by surface policy: 10 read-only surface: method mutates state',
        ]);
    });

    it('carries the excluded methods alongside the kept ones under --json', async () => {
        await run({ filter: 'entries.c', 'read-only': true, json: true });

        expect(JSON.parse(printed.join('\n'))).toMatchObject({
            methods: [],
            excluded: [
                {
                    id: 'entries.recipe.create',
                    reason: 'read-only surface: method mutates state',
                },
            ],
        });
    });

    it('reports a role the config does not define as the command’s error', async () => {
        await run({ role: 'nobody' });

        expect(printed).toEqual([]);
        expect(errors.at(-1)).toContain(
            'Unknown role "nobody". Configured roles: admin, editor, reader'
        );
        expect(process.exitCode).toBe(1);
    });
});
