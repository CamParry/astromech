/**
 * A lock that lets one heavy run at a time go ahead on this machine: the gate
 * (`scripts/verify.mjs`), the root `build`, `build:js` and `test:run` scripts
 * and the two boot checks. Two of them at once have run a 16 GB laptop out of
 * memory, whether they ran in the same worktree, in two worktrees or from two
 * sessions. A run that finds the lock held prints one line naming the holder,
 * waits, and starts when the lock is free.
 *
 * The lock is a file in `os.tmpdir()`, which is the same directory for every
 * worktree, clone and session of one user. It holds the owner's pid, worktree,
 * script name and start time. It is created with the `wx` flag, so creating it
 * is atomic: of two runs that try at once, one fails and waits.
 *
 * The owner removes the file when its process exits: normally, on a failure,
 * or through `process.exit` from a signal handler. A process killed outright
 * leaves the file behind, and the next run takes it over once the pid it names
 * is not running.
 *
 * A run started by the owner, such as `pnpm run build` inside the gate, must
 * not wait for its parent. The owner sets `ASTROMECH_RUN_LOCK_PID` to its pid,
 * every process it starts inherits it, and a run that finds it naming a live
 * process goes ahead without the lock.
 *
 * Used by `scripts/verify.mjs`, the boot checks and
 * `scripts/run-at-lower-priority.mjs` (its `--lock` flag).
 */
import console from 'node:console';
import { readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const LOCK_PATH = join(tmpdir(), 'astromech-run.lock');

/** Set, to the owner's pid, in the environment of every process the owner starts. */
const HOLDER_VARIABLE = 'ASTROMECH_RUN_LOCK_PID';

const POLL_MS = 5000;

/**
 * How long a lock file may stay unreadable before it counts as stale. The
 * owner writes it in the same call that creates it, so only a run killed
 * between the two leaves it empty.
 */
const UNREADABLE_GRACE_MS = 30_000;

const worktree = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Waits until this process holds the lock, then returns. `name` is the run's
 * name in the lines other runs print while they wait; pnpm's script name
 * (`npm_lifecycle_event`) is used when it is set. Returns at once when an
 * ancestor holds the lock.
 */
export async function waitForRunLock(name) {
    if (ancestorHoldsLock()) return;
    const label = process.env.npm_lifecycle_event ?? name;
    const record = JSON.stringify({
        pid: process.pid,
        worktree,
        name: label,
        startedAt: Date.now(),
    });
    const waitStarted = Date.now();
    let reportedPid;
    for (;;) {
        if (tryCreate(record)) break;
        const holder = readHolder();
        if (holder === 'missing') continue;
        if (holder === 'unreadable') {
            if (Date.now() - modifiedAt() > UNREADABLE_GRACE_MS) {
                console.log('run-lock: taking over an unreadable lock file');
                removeIf(() => readHolder() === 'unreadable');
                continue;
            }
        } else if (!isRunning(holder.pid)) {
            console.log(
                `run-lock: taking over from ${describe(holder)}, which is no longer running`
            );
            removeIf(() => readHolder().pid === holder.pid);
            continue;
        } else if (holder.pid !== reportedPid) {
            reportedPid = holder.pid;
            console.log(
                `run-lock: waiting for ${describe(holder)}, running for ${duration(Date.now() - holder.startedAt)}; checking every ${POLL_MS / 1000} s`
            );
        }
        await new Promise((fulfil) => setTimeout(fulfil, POLL_MS));
    }
    if (reportedPid !== undefined) {
        console.log(
            `run-lock: lock taken after ${duration(Date.now() - waitStarted)}, starting`
        );
    }
    process.env[HOLDER_VARIABLE] = String(process.pid);
    process.on('exit', releaseRunLock);
}

/**
 * Removes the lock file if this process owns it. Runs on exit by itself; call
 * it directly only before a process stops itself with a signal, which skips
 * the `exit` event.
 */
export function releaseRunLock() {
    removeIf(() => readHolder().pid === process.pid);
}

function ancestorHoldsLock() {
    const pid = Number(process.env[HOLDER_VARIABLE]);
    return Number.isInteger(pid) && pid > 0 && isRunning(pid);
}

function tryCreate(record) {
    try {
        writeFileSync(LOCK_PATH, record, { flag: 'wx' });
        return true;
    } catch (error) {
        if (error.code === 'EEXIST') return false;
        throw error;
    }
}

/** The lock's owner, or `missing`, or `unreadable` while its owner is still writing it. */
function readHolder() {
    let text;
    try {
        text = readFileSync(LOCK_PATH, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') return 'missing';
        throw error;
    }
    try {
        const holder = JSON.parse(text);
        return Number.isInteger(holder?.pid) ? holder : 'unreadable';
    } catch {
        return 'unreadable';
    }
}

function modifiedAt() {
    try {
        return statSync(LOCK_PATH).mtimeMs;
    } catch {
        return Date.now();
    }
}

/**
 * Removes the lock file when `stillApplies` holds just before the removal, so
 * a run that read a stale owner does not remove the lock another run has
 * taken over since.
 */
function removeIf(stillApplies) {
    try {
        if (stillApplies()) unlinkSync(LOCK_PATH);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

/** Signal 0 only asks whether the process exists. EPERM means it does, under another user. */
function isRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error.code === 'EPERM';
    }
}

function describe({ name, worktree: path, pid }) {
    return `${name} in ${path} (pid ${pid})`;
}

function duration(ms) {
    const seconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}
