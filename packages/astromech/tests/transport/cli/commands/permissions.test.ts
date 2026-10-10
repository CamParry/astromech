/**
 * `astromech permissions`: lists the permissions a role can be granted under
 * the config named by `--config`, as aligned text or as JSON.
 *
 * The config is a real file in a temp site, loaded the way the CLI loads one
 * (`tests/_support/cli.ts`). Its database is an empty stand-in: the command
 * never queries it.
 */

import { join } from 'node:path';
import { createTempSite, run, runOk, writeSiteConfig } from '@tests/cli';
import { resetRuntime } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import permissions from '@/transport/cli/commands/permissions';

let siteDir: string;
let configPath: string;

beforeEach(async () => {
    resetRuntime();
    siteDir = await createTempSite();
    configPath = await writeSiteConfig(siteDir, {
        entries: [{ type: 'recipe', single: 'Recipe', plural: 'Recipes', fields: [] }],
        globals: [{ key: 'site', label: 'Site', fields: [] }],
    });
});

/** The permission strings `--json` lists, in order. */
function listedPermissions(stdout: string[]): string[] {
    const listed = JSON.parse(stdout.join('\n')) as { permission: string }[];
    return listed.map((p) => p.permission);
}

describe('permissions', () => {
    it('lists the config’s entry and global permissions, one aligned line each', async () => {
        const result = await run(permissions, [
            '--config',
            configPath,
            '--filter',
            'SITE',
        ]);

        // `global:site:update` is the longest string, so the others pad to it.
        expect(result).toEqual({
            stdout: [
                'global:site:publish  Publish "site" global  (site)',
                'global:site:read     Read "site" global  (site)',
                'global:site:update   Update "site" global  (site)',
            ],
            stderr: [],
            exitCode: 0,
        });
    });

    it('narrows to one source, as JSON under --json', async () => {
        const { stdout } = await runOk(permissions, [
            '--config',
            configPath,
            '--source',
            'entry',
            '--json',
        ]);

        expect(listedPermissions(stdout)).toEqual([
            'entry:recipe:create',
            'entry:recipe:delete',
            'entry:recipe:publish',
            'entry:recipe:read',
            'entry:recipe:update',
        ]);
    });

    it('lists core permissions before the config’s own', async () => {
        const { stdout } = await runOk(permissions, ['--config', configPath, '--json']);

        const listed = listedPermissions(stdout);
        // `users:update` is a core permission that sorts after `entry:` and
        // `global:`: it comes before them only because core is listed first.
        expect(listed).toContain('users:update');
        expect(listed.slice(-8)).toEqual([
            'entry:recipe:create',
            'entry:recipe:delete',
            'entry:recipe:publish',
            'entry:recipe:read',
            'entry:recipe:update',
            'global:site:publish',
            'global:site:read',
            'global:site:update',
        ]);
    });

    it('reports a config that cannot be loaded as the command’s error', async () => {
        const result = await run(permissions, [
            '--config',
            join(siteDir, 'missing.config.mjs'),
            '--json',
        ]);

        expect(result.stdout).toEqual([]);
        expect(result.stderr).toHaveLength(1);
        expect(JSON.parse(result.stderr[0] ?? '{}')).toEqual({
            error: expect.stringContaining(
                `Cannot find module '${join(siteDir, 'missing.config.mjs')}'`
            ),
        });
        expect(result.exitCode).toBe(1);
    });

    it('runs against a remote database without --allow-remote or opening it', async () => {
        const config = await writeSiteConfig(siteDir, {
            globals: [{ key: 'site', label: 'Site', fields: [] }],
            remote: true,
            throwOnOpen: true,
        });

        const result = await run(permissions, [
            '--config',
            config,
            '--filter',
            'global:',
        ]);

        expect(result).toEqual({
            stdout: [
                'global:site:publish  Publish "site" global  (site)',
                'global:site:read     Read "site" global  (site)',
                'global:site:update   Update "site" global  (site)',
            ],
            stderr: [],
            exitCode: 0,
        });
    });
});
