#!/usr/bin/env node
/**
 * Runs a command at a lower priority when the CPU limits apply
 * (`scripts/cpu-limits.mjs`), and as it is otherwise:
 *
 *     node scripts/run-at-lower-priority.mjs [--lock] <command> [args…]
 *
 * The root `package.json` scripts that test, build, typecheck and lint start
 * through it, so a standalone `pnpm run build` leaves the machine usable as the
 * gate does. A script that chains commands passes the whole chain as
 * `sh -c '…'`, so every command in it runs at the lower priority. Under the
 * gate, or in CI, it runs the command as it is.
 *
 * With `--lock`, the command first waits for the lock in
 * `scripts/run-lock.mjs`, so it never runs beside a gate, build, test run or
 * boot check in any worktree. `build`, `build:js` and `test:run` pass it.
 * `typecheck` and `lint` do not: they are the quick checks run between edits,
 * they need a fraction of a test suite's memory, and waiting behind a whole
 * gate for them would cost more than they save.
 *
 * Output passes straight through, and this exits with the command's code, or
 * is stopped by the same signal that stopped it.
 */
import { spawn } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { execAtLowerPriority, relaunchAtLowerPriority } from './cpu-limits.mjs';
import { releaseRunLock, waitForRunLock } from './run-lock.mjs';

const lock = process.argv[2] === '--lock';
const [command, ...args] = process.argv.slice(lock ? 3 : 2);
if (command === undefined) {
    console.error(
        'usage: node scripts/run-at-lower-priority.mjs [--lock] <command> [args…]'
    );
    process.exit(2);
}

if (lock) {
    // This process holds the lock until the command exits, so it relaunches
    // itself at the lower priority and starts the command, which inherits it.
    relaunchAtLowerPriority();
    await waitForRunLock(command);
} else {
    // Replaces this process when the limits apply, so the command keeps its pid.
    execAtLowerPriority(command, args);
}

const child = spawn(command, args, {
    stdio: 'inherit',
    // `pnpm` is `pnpm.cmd` on Windows, which only a shell runs.
    shell: process.platform === 'win32',
});

// Ctrl-C at a terminal reaches the command too, so this waits for it to exit.
process.on('SIGINT', () => undefined);
// A signal sent to this process alone is passed on.
for (const signal of ['SIGTERM', 'SIGHUP']) {
    process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
    console.error(`run-at-lower-priority: could not start ${command}: ${error.message}`);
    process.exit(127);
});
child.on('exit', (code, signal) => {
    if (signal === null) process.exit(code);
    // Stopping this process with the signal skips the `exit` event.
    releaseRunLock();
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
});
