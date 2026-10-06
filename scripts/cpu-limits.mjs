/**
 * CPU limits for a local run of the tests, the gate or a boot check, so the
 * run leaves the rest of the machine usable. Unlimited, a run takes every core
 * of a laptop for its whole length.
 *
 * A limited run does two things:
 *
 * - It runs at macOS's utility QoS (`taskpolicy -c utility`), so the
 *   scheduler gives the user's own work the cores first. The run still uses
 *   any core left idle. `verify.mjs` and the boot checks relaunch themselves
 *   with `relaunchAtLowerPriority`, and the root `package.json` scripts that
 *   test, build, typecheck and lint start through
 *   `scripts/run-at-lower-priority.mjs`.
 * - It runs fewer workers: `TEST_WORKERS` and `WORKSPACE_CONCURRENCY`.
 *
 * A vitest command run directly (`pnpm -F <package> exec vitest run`) gets
 * the fewer workers but not the lower priority: its config could only lower it
 * by replacing the process the config is loading in.
 *
 * The limits apply off CI on macOS. They do not apply in CI (`CI` set), on
 * Linux or on Windows, or when `ASTROMECH_FULL_SPEED` is set, for the fastest
 * run on an idle machine.
 *
 * Used by `scripts/verify.mjs`, the boot checks,
 * `scripts/run-at-lower-priority.mjs`, core's shared vitest settings
 * (`packages/astromech/tests/_support/vitest-base-config.ts`) and the schema
 * engine's vitest config.
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
 * pnpm's workspace concurrency for typecheck and lint in a limited run of the
 * gate. pnpm's default is four, and both share a stage with the tests.
 */
export const WORKSPACE_CONCURRENCY = 2;

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
export function relaunchAtLowerPriority() {
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
export function execAtLowerPriority(command, args) {
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
        console.log(`cpu-limits: running at normal priority (${error.message})`);
    }
}
