#!/usr/bin/env node
/**
 * Runs a command at a lower priority when the CPU limits apply
 * (`scripts/cpu-limits.mjs`), and as it is otherwise:
 *
 *     node scripts/run-at-lower-priority.mjs <command> [args…]
 *
 * The root `package.json` scripts that test, build, typecheck and lint start
 * through it, so a standalone `pnpm run build` leaves the machine usable as the
 * gate does. Under the gate, or in CI, it runs the command as it is.
 *
 * Output passes straight through, and this exits with the command's code, or
 * is stopped by the same signal that stopped it.
 */
import { spawn } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { execAtLowerPriority } from './cpu-limits.mjs';

const [command, ...args] = process.argv.slice(2);
if (command === undefined) {
    console.error('usage: node scripts/run-at-lower-priority.mjs <command> [args…]');
    process.exit(2);
}

// Replaces this process when the limits apply, so the command keeps its pid.
execAtLowerPriority(command, args);

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
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
});
