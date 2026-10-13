/**
 * Runs `turbo run <task…>` at a lower priority, with the gate's environment,
 * so a root script uses the cache every worktree shares and leaves the machine
 * usable as the gate does.
 *
 *     node scripts/turbo.ts [--lock] [--no-dts] [--filter <pattern>]… <task>…
 *
 * The root `build`, `build:js`, `typecheck`, `lint` and `test:run` scripts and
 * the Cloudflare demo's `deploy:testing` run through it, as does the
 * worktree's post-create build (`.config/wt.toml`, through `pnpm run build`).
 *
 * Exit codes: Turborepo's, or this process is stopped by the signal that
 * stopped Turborepo; 2 on a usage error.
 *
 * - The priority and the number of tasks at once are the gate's
 *   (`scripts/lib/cpu-limits.ts`, `gateConcurrency` in `scripts/lib/gate.ts`).
 * - The environment is the gate's (`turboEnvironment` in `scripts/lib/gate.ts`):
 *   `TURBO_CACHE_DIR` names the shared cache, and `ASTROMECH_NODE_MAJOR` is
 *   set, so a task whose inputs match a gate run's is a cache hit, restored
 *   rather than rerun, and the other way round. Nothing is scoped with
 *   `--affected`.
 * - `--lock` waits for the run lock first (`scripts/lib/run-lock.ts`), so the
 *   run never goes beside a gate, build, test run or boot check in any
 *   worktree. `build`, `build:js` and `test:run` pass it. `typecheck` and
 *   `lint` do not: they are the quick checks run between edits, they need a
 *   fraction of a test suite's memory, and waiting behind a whole gate for
 *   them would cost more than they save.
 * - `--no-dts` sets `ASTROMECH_NO_DTS`, which `build` lists in its `env`, so
 *   the builds write no declarations, as the gate's runtime mode does.
 * - `--filter` is passed to Turborepo, as `turbo run --filter` takes it. The
 *   root `typecheck` leaves out the apps (`--filter='!./apps/*'`), whose
 *   typecheck waits for their boot checks, and type-checks them after, against
 *   the `dist` already built (`typecheck:apps`). Turborepo's `--only` would
 *   skip the boot checks too, but it leaves the tasks it skips out of each
 *   hash, so a pass could be restored after a package it reads had changed.
 *
 * A failed task does not stop the others (`--continue=dependencies-successful`).
 */
import console from 'node:console';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { environmentWithoutNodeEnv } from './lib/check-helpers.ts';
import { relaunchAtLowerPriority } from './lib/cpu-limits.ts';
import { gateConcurrency, turboBinary, turboEnvironment } from './lib/gate.ts';
import { endAs, runCommand } from './lib/run-lock.ts';

const USAGE =
    'usage: node scripts/turbo.ts [--lock] [--no-dts] [--filter <pattern>]… <task>…';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const options = parseArguments();
if (options === undefined) {
    process.exitCode = 2;
} else {
    // First, before anything prints: Turborepo and its tasks inherit the priority.
    relaunchAtLowerPriority();
    const environment = turboEnvironment(
        repoRoot,
        options.noDts ? 'runtime' : 'full',
        { affected: false },
        environmentWithoutNodeEnv('turbo')
    );
    const args = [
        'run',
        ...options.tasks,
        ...options.filters.map((filter) => `--filter=${filter}`),
        '--continue=dependencies-successful',
        `--concurrency=${gateConcurrency()}`,
    ];
    endAs(
        await runCommand(turboBinary(repoRoot), args, {
            cwd: repoRoot,
            env: environment,
            ...(options.lock ? { lock: `turbo run ${options.tasks.join(' ')}` } : {}),
        })
    );
}

/**
 * The flags and tasks, or undefined after printing the usage. pnpm passes a
 * `--` on to the script, so every `--` is dropped.
 */
function parseArguments():
    | { lock: boolean; noDts: boolean; filters: string[]; tasks: string[] }
    | undefined {
    try {
        const { values, positionals } = parseArgs({
            args: process.argv.slice(2).filter((arg) => arg !== '--'),
            strict: true,
            allowPositionals: true,
            options: {
                lock: { type: 'boolean' },
                'no-dts': { type: 'boolean' },
                filter: { type: 'string', multiple: true },
            },
        });
        if (positionals.length === 0) throw new Error('Name at least one task.');
        return {
            lock: values.lock === true,
            noDts: values['no-dts'] === true,
            filters: values.filter ?? [],
            tasks: positionals,
        };
    } catch (error) {
        console.error(`${(error as Error).message}\n${USAGE}`);
        return undefined;
    }
}
