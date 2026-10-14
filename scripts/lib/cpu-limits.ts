/**
 * CPU limits for a local run of the tests, the gate or a boot check, so the
 * run leaves the rest of the machine usable. Unlimited, a run takes every core
 * of a laptop for its whole length.
 *
 * A limited run does two things:
 *
 * - It runs at macOS's utility QoS (`taskpolicy -c utility`), so the
 *   scheduler gives the user's own work the cores first. The run still uses
 *   any core left idle. `scripts/verify.ts`, the boot checks and
 *   `scripts/turbo.ts`, which the root `package.json` scripts that test,
 *   build, typecheck and lint start through, relaunch themselves with
 *   `relaunchAtLowerPriority`.
 * - It runs fewer workers: `TEST_WORKERS`, and `WORKSPACE_CONCURRENCY` tasks
 *   of a Turborepo run at once (`gateConcurrency` in `scripts/lib/gate.ts`).
 *
 * A vitest command run directly (`pnpm -F <package> exec vitest run`) gets
 * the fewer workers but not the lower priority: its config could only lower it
 * by replacing the process the config is loading in.
 *
 * The limits apply off CI on macOS. They do not apply in CI (`CI` set), on
 * Linux or on Windows, or when `ASTROMECH_FULL_SPEED` is set, for the fastest
 * run on an idle machine.
 *
 * Used by `scripts/verify.ts`, `scripts/turbo.ts`, the boot checks, the gate's
 * concurrency, core's shared vitest settings
 * (`packages/astromech/tests/_support/vitest-base-config.ts`) and the schema
 * engine's vitest config. The vitest configs import it without an extension,
 * as the packages' bundler resolution does: `tsc` refuses a `.ts` specifier
 * unless `allowImportingTsExtensions` is set.
 */
import console from 'node:console';
import process from 'node:process';

/** Whether this run is limited. */
export const cpuLimitsApply =
    process.platform === 'darwin' && !process.env.CI && !process.env.ASTROMECH_FULL_SPEED;

/**
 * Vitest's `maxWorkers` for a limited run. Vitest's own default is one per CPU
 * less one, which is nine on a ten-core laptop.
 */
export const TEST_WORKERS = 4;

/**
 * How many tasks a limited run of the gate runs at once (Turborepo's
 * `--concurrency`, whose default is ten). Each test suite runs `TEST_WORKERS`
 * workers of its own. The run lock lets one gate run at a time, so the limit
 * is set for one gate beside other sessions' lighter work: at 2, the gate left
 * the machine at about 40% CPU.
 */
export const WORKSPACE_CONCURRENCY = 4;

/**
 * Set on a process that already runs at the lower priority. Every process it
 * starts inherits the priority, and this variable tells them not to relaunch.
 */
const LOWERED_PRIORITY = 'ASTROMECH_LOWERED_PRIORITY';

const TASKPOLICY = '/usr/sbin/taskpolicy';

/**
 * Replaces the current process with the same command run under
 * `taskpolicy -c utility`, keeping its pid, arguments and output. Call it
 * before the process starts any work or prints anything. Does nothing when the
 * limits do not apply or the priority is already lowered.
 *
 * macOS applies a QoS clamp only when a program starts, not to a running
 * process, hence the relaunch. When it fails the run carries on at normal
 * priority, after one line saying so.
 */
export function relaunchAtLowerPriority(): void {
    execAtLowerPriority(process.execPath, [
        ...process.execArgv,
        ...process.argv.slice(1),
    ]);
}

/**
 * Replaces the current process with `command` run under
 * `taskpolicy -c utility`, which finds `command` on the `PATH`. Returns, having
 * done nothing, when the limits do not apply or the priority is already
 * lowered, and after one line saying so when the replacement fails.
 */
function execAtLowerPriority(command: string, args: readonly string[]): void {
    if (!cpuLimitsApply || process.env[LOWERED_PRIORITY] !== undefined) return;
    if (typeof process.execve !== 'function') {
        console.log(
            'cpu-limits: running at normal priority (this needs Node 22.15 or later)'
        );
        return;
    }
    try {
        process.execve(TASKPOLICY, [TASKPOLICY, '-c', 'utility', command, ...args], {
            ...process.env,
            [LOWERED_PRIORITY]: '1',
        });
    } catch (error) {
        console.log(
            `cpu-limits: running at normal priority (${(error as Error).message})`
        );
    }
}
