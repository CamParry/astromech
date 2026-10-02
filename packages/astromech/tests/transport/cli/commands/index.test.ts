/**
 * The `astromech` entry point (`src/transport/cli/index.ts`): dispatches the
 * first argument to its command and refuses one it does not know.
 *
 * The entry point calls `runMain` when it is imported, reading `process.argv`
 * and exiting the process, so it runs in a child process: from source through
 * tsx, which resolves the package's `@/` paths from its tsconfig.
 */

import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createTempSite, writeSiteConfig } from '@tests/cli';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const packageRoot = resolve(import.meta.dirname, '../../../..');
const entryPoint = join(packageRoot, 'src/transport/cli/index.ts');

/** A child process start through tsx takes a few seconds on a loaded machine. */
const SPAWN_TIMEOUT_MS = 30_000;

/** How long a child may run before it is killed, short of the test's own timeout. */
const CHILD_TIMEOUT_MS = SPAWN_TIMEOUT_MS - 5_000;

type Result = { code: number; stdout: string; stderr: string };

/** Run `astromech <args>` from source and collect what it printed. */
async function cli(args: string[]): Promise<Result> {
    try {
        const { stdout, stderr } = await promisify(execFile)(
            process.execPath,
            [require.resolve('tsx/cli'), entryPoint, ...args],
            {
                cwd: packageRoot,
                env: { ...process.env, NO_COLOR: '1' },
                timeout: CHILD_TIMEOUT_MS,
                killSignal: 'SIGKILL',
            }
        );
        return { code: 0, stdout, stderr };
    } catch (error) {
        const failed = error as {
            code: number;
            killed?: boolean;
            stdout: string;
            stderr: string;
        };
        if (failed.killed === true) {
            throw new Error(
                `astromech ${args.join(' ')} was killed after ${CHILD_TIMEOUT_MS}ms:\n${failed.stderr}`,
                { cause: error }
            );
        }
        return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr };
    }
}

describe('astromech', () => {
    it(
        'dispatches a known command with its flags',
        async () => {
            const configPath = await writeSiteConfig(await createTempSite(), {
                globals: [{ key: 'site', label: 'Site', fields: [] }],
            });

            const result = await cli([
                'permissions',
                '--config',
                configPath,
                '--source',
                'global',
            ]);

            expect(result.code).toBe(0);
            expect(result.stdout.trim().split('\n')).toEqual([
                'global:site:publish  Publish "site" global  (site)',
                'global:site:read     Read "site" global  (site)',
                'global:site:update   Update "site" global  (site)',
            ]);
        },
        SPAWN_TIMEOUT_MS
    );

    it(
        'refuses an unknown command, listing the known ones, with exit code 1',
        async () => {
            const result = await cli(['nope']);

            expect(result.code).toBe(1);
            expect(result.stderr).toContain('Unknown command nope');
            expect(result.stdout).toContain('USAGE astromech db:init|');
            expect(result.stdout).toMatch(
                /^\s+permissions\s+List grantable permissions/m
            );
        },
        SPAWN_TIMEOUT_MS
    );
});
