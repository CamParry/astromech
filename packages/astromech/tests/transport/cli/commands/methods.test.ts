/**
 * `astromech methods`: boots the site named by `--config` and lists the
 * methods its manifest offers, narrowed by the view and surface filters.
 *
 * The config is a real file in a temp site, loaded and booted the way the CLI
 * boots one (`tests/_support/cli.ts`), over a copy of the run's migrated test
 * database.
 */

import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempSite, run, runOk, writeSiteConfig } from '@tests/cli';
import { resetRuntime } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { getDb } from '@/database/registry';
import methods from '@/transport/cli/commands/methods';

let configPath: string;

beforeEach(async () => {
    resetRuntime();
    const siteDir = await createTempSite();
    const database = join(siteDir, 'site.db');
    await copyFile(inject('testDbTemplate'), database);
    configPath = await writeSiteConfig(siteDir, {
        database,
        entries: {
            recipe: { single: 'Recipe', plural: 'Recipes', fields: [] },
        },
        roles: { reader: { name: 'Reader', permissions: ['entry:recipe:read'] } },
    });
});

afterEach(async () => {
    await getDb().destroy();
    resetRuntime();
});

describe('methods', () => {
    it('lists each method of a source with its effects and permission', async () => {
        const { stdout, stderr } = await run(methods, [
            '--config',
            configPath,
            '--source',
            'entries',
        ]);

        expect(stdout).toContain(
            'entries.recipe.create  [mutates]  (permission: entry:recipe:create)'
        );
        expect(stdout).toContain(
            'entries.recipe.delete  [mutates destructive]  (permission: entry:recipe:delete)'
        );
        expect(stdout).toContain('entries.recipe.get  (permission: entry:recipe:read)');
        expect(stdout.every((line) => line.startsWith('entries.'))).toBe(true);
        expect(stderr).toEqual([]);
    });

    it('marks what a role may not call, or may depending on the target, under --role', async () => {
        const { stdout, stderr } = await run(methods, [
            '--config',
            configPath,
            '--role',
            'reader',
        ]);

        expect(stdout).toContain('entries.recipe.get  (permission: entry:recipe:read)');
        expect(stdout).toContain(
            'entries.recipe.create  [mutates denied]  (permission: entry:recipe:create)'
        );
        expect(stdout).toContain('globals.get  [depends]  (permission: dynamic)');
        expect(stdout).toContain('notifications.count  (permission: none)');
        expect(stderr).toEqual([]);
    });

    it('lists only what --read-only keeps, and counts what it excluded', async () => {
        const { stdout } = await runOk(methods, [
            '--config',
            configPath,
            '--source',
            'entries',
            '--read-only',
        ]);

        expect(stdout).toEqual([
            'entries.recipe.get  (permission: entry:recipe:read)',
            'entries.recipe.query  (permission: entry:recipe:read)',
            'entries.recipe.usedBy  (permission: entry:recipe:read)',
            '\n10 excluded by surface policy: 10 read-only surface: method mutates state',
        ]);
    });

    it('matches --filter against the entry type as well as the method name', async () => {
        const { stdout } = await runOk(methods, [
            '--config',
            configPath,
            '--filter',
            'RECIPE',
        ]);

        expect(stdout).toContain(
            'entries.recipe.create  [mutates]  (permission: entry:recipe:create)'
        );
        expect(stdout.every((line) => line.startsWith('entries.recipe.'))).toBe(true);
    });

    it('carries the excluded methods alongside the kept ones under --json', async () => {
        const { stdout } = await runOk(methods, [
            '--config',
            configPath,
            '--filter',
            'entries.c',
            '--read-only',
            '--json',
        ]);

        expect(JSON.parse(stdout.join('\n'))).toMatchObject({
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
        const result = await run(methods, ['--config', configPath, '--role', 'nobody']);

        expect(result.stdout).toEqual([]);
        expect(result.stderr).toEqual([
            'Error: Validation failed:\n  role: Unknown role "nobody". Configured roles: admin, editor, reader',
        ]);
        expect(result.exitCode).toBe(1);
    });
});
