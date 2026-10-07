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
 * gate for them would cost more than they save. When this process takes the
 * lock itself, the command runs in a process group of its own, recorded in the
 * lock file, with no stdin, and this passes on Ctrl-C and the other signals
 * that stop it.
 *
 * Output passes straight through, and this exits with the command's code, or
 * is stopped by the same signal that stopped it.
 */
import { spawn } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { execAtLowerPriority, relaunchAtLowerPriority } from './cpu-limits.mjs';
import { signalGroup } from './process-group.mjs';
import { recordProcessGroups, releaseRunLock, waitForRunLock } from './run-lock.mjs';

const lock = process.argv[2] === '--lock';
const [command, ...args] = process.argv.slice(lock ? 3 : 2);
if (command === undefined) {
    console.error(
        'usage: node scripts/run-at-lower-priority.mjs [--lock] <command> [args…]'
    );
    process.exit(2);
}

/** Whether this process took the lock, rather than going ahead under an ancestor's. */
let ownsLock = false;
if (lock) {
    // This process holds the lock until the command exits, so it relaunches
    // itself at the lower priority and starts the command, which inherits it.
    relaunchAtLowerPriority();
    ownsLock = await waitForRunLock(command);
} else {
    // Replaces this process when the limits apply, so the command keeps its pid.
    execAtLowerPriority(command, args);
}

// When this process owns the lock, the command leads a process group of its
// own, which the lock file lists, so a run that finds this process killed
// outright waits for the command too. Under an ancestor's lock it stays in this
// process's group, which the ancestor lists. Not on Windows, which has no
// process groups.
const ownGroup = ownsLock && process.platform !== 'win32';

const child = spawn(command, args, {
    // A process outside the terminal's foreground group that reads from it is
    // stopped, so the command gets no stdin of its own.
    stdio: ownGroup ? ['ignore', 'inherit', 'inherit'] : 'inherit',
    detached: ownGroup,
    // `pnpm` is `pnpm.cmd` on Windows, which only a shell runs.
    shell: process.platform === 'win32',
});

if (ownGroup) {
    if (child.pid !== undefined) recordProcessGroups([child.pid]);
    // Ctrl-C at a terminal reaches only this process's group, so every signal
    // is passed on to the command's.
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.on(signal, () => signalGroup(child.pid, signal));
    }
} else {
    // Ctrl-C at a terminal reaches the command too, so this waits for it to exit.
    process.on('SIGINT', () => undefined);
    // A signal sent to this process alone is passed on.
    for (const signal of ['SIGTERM', 'SIGHUP']) {
        process.on(signal, () => child.kill(signal));
    }
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
