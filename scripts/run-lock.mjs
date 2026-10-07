/**
 * A lock that lets one heavy run at a time go ahead on this machine: the gate
 * (`scripts/verify.mjs`), the root `build`, `build:js` and `test:run` scripts
 * and the two boot checks. Two of them at once have run a 16 GB laptop out of
 * memory, whether they ran in the same worktree, in two worktrees or from two
 * sessions. A run that finds the lock held prints one line naming the holder,
 * waits, and starts when the lock is free.
 *
 * The lock is a file in `os.tmpdir()`, which is the same directory for every
 * worktree, clone and session of one user. It holds the owner's pid, the
 * owner's start time as `ps` reports it, its worktree, script name and the time
 * it took the lock. It is created with the `wx` flag, so creating it is
 * atomic: of two runs that try at once, one fails and waits.
 *
 * The owner removes the file when its process exits: normally, on a failure,
 * or through `process.exit` from a signal handler. A process killed outright
 * leaves the file behind, and the next run takes it over once the owner is not
 * running. The owner counts as running only while its pid is alive and that
 * pid's start time is the one recorded, so a pid the system has since given to
 * another process does not hold the lock forever.
 *
 * An owner that starts its work in process groups of its own records those
 * groups in the lock file (`recordProcessGroups`): the gate one per check, the
 * boot checks their build and server, and `run-at-lower-priority.mjs --lock`
 * its command. An owner killed outright leaves them running, so a run that
 * finds the owner gone waits until none of its recorded groups is running
 * either.
 *
 * Taking over is atomic too: a run moves the stale file aside under a name of
 * its own and reads it back. If it is not the stale file it read, another run
 * took the lock over in between, and the file goes back. A run killed between
 * moving the file aside, or writing its scratch file in `recordProcessGroups`,
 * and removing it leaves an `astromech-run.lock.<pid>.stale` or `.tmp` file;
 * the next run to take the lock removes those whose pid is not running.
 *
 * A run started by the owner, such as `pnpm run build` inside the gate, must
 * not wait for its parent. The owner sets `ASTROMECH_RUN_LOCK_PID` to its pid,
 * every process it starts inherits it, and a run that finds it naming a live
 * process, or the owner the lock file still names, goes ahead without the lock.
 * Such a run records nothing: the lock file is its ancestor's, which lists the
 * group the run is in.
 *
 * Used by `scripts/verify.mjs`, the boot checks and
 * `scripts/run-at-lower-priority.mjs` (its `--lock` flag).
 */
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import {
    linkSync,
    readdirSync,
    readFileSync,
    renameSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { processGroupIsRunning } from './process-group.mjs';

const LOCK_PATH = join(tmpdir(), 'astromech-run.lock');

/** The names `takeOver` and `recordProcessGroups` give their files, with the pid. */
const LEFTOVER_FILE = /^astromech-run\.lock\.(\d+)\.(?:stale|tmp)$/;

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

/** This process's lock record, once it holds the lock. */
let ownRecord;

/**
 * Waits until this process holds the lock, then returns true. `name` is the
 * run's name in the lines other runs print while they wait; pnpm's script name
 * (`npm_lifecycle_event`) is used when it is set. Returns false at once when an
 * ancestor holds the lock.
 */
export async function waitForRunLock(name) {
    if (ancestorHoldsLock()) return false;
    const record = {
        pid: process.pid,
        processStart: processStart(process.pid),
        worktree,
        name: process.env.npm_lifecycle_event ?? name,
        startedAt: Date.now(),
    };
    const waitStarted = Date.now();
    let reported;
    const report = (key, message) => {
        if (key === reported) return;
        reported = key;
        console.log(`run-lock: ${message}; checking every ${POLL_MS / 1000} s`);
    };
    for (;;) {
        if (tryCreate(JSON.stringify(record))) break;
        const lock = readLock();
        if (lock === 'missing') continue;
        const { holder, text } = lock;
        if (holder === undefined) {
            if (Date.now() - modifiedAt() > UNREADABLE_GRACE_MS) {
                if (takeOver(text)) {
                    console.log('run-lock: took over an unreadable lock file');
                }
                continue;
            }
        } else if (holderIsRunning(holder)) {
            report(
                `${holder.pid} ${holder.startedAt}`,
                `waiting for ${describe(holder)}, running for ${duration(Date.now() - holder.startedAt)}`
            );
        } else {
            const left = (holder.groups ?? []).filter(processGroupIsRunning);
            if (left.length === 0) {
                if (takeOver(text)) {
                    console.log(
                        `run-lock: took over from ${describe(holder)}, which is no longer running`
                    );
                }
                continue;
            }
            report(
                `${holder.pid} ${holder.startedAt} ${left.join(',')}`,
                `waiting for process group(s) ${left.join(', ')}, left running by ${describe(holder)}, which is no longer running`
            );
        }
        await new Promise((fulfil) => setTimeout(fulfil, POLL_MS));
    }
    if (reported !== undefined) {
        console.log(
            `run-lock: lock taken after ${duration(Date.now() - waitStarted)}, starting`
        );
    }
    ownRecord = record;
    process.env[HOLDER_VARIABLE] = String(process.pid);
    process.on('exit', releaseRunLock);
    removeLeftoverFiles();
    return true;
}

/**
 * Records, in the lock file, the process groups this owner's runs lead, so a
 * run that finds this owner killed waits for them too. Does nothing unless this
 * process holds the lock. The file is replaced by a rename, so a reader never
 * sees it half written.
 */
export function recordProcessGroups(groups) {
    if (ownRecord === undefined) return;
    ownRecord = { ...ownRecord, groups };
    const scratch = `${LOCK_PATH}.${process.pid}.tmp`;
    writeFileSync(scratch, JSON.stringify(ownRecord));
    renameSync(scratch, LOCK_PATH);
}

/**
 * Removes the lock file if this process owns it. Runs on exit by itself; call
 * it directly only before a process stops itself with a signal, which skips
 * the `exit` event.
 */
export function releaseRunLock() {
    ownRecord = undefined;
    const lock = readLock();
    if (lock === 'missing' || lock.holder?.pid !== process.pid) return;
    try {
        unlinkSync(LOCK_PATH);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

/**
 * Whether the run that set the holder variable still holds the lock: it is
 * running, or it was killed and the lock file still names it, as when a check
 * the gate started outlives the gate.
 */
function ancestorHoldsLock() {
    const pid = Number(process.env[HOLDER_VARIABLE]);
    if (!Number.isInteger(pid) || pid <= 0) return false;
    if (isRunning(pid)) return true;
    const lock = readLock();
    return lock !== 'missing' && lock.holder?.pid === pid;
}

function tryCreate(text) {
    try {
        writeFileSync(LOCK_PATH, text, { flag: 'wx' });
        return true;
    } catch (error) {
        if (error.code === 'EEXIST') return false;
        throw error;
    }
}

/**
 * The lock file's text and owner, or `missing`. `holder` is undefined when the
 * file is unreadable, as while its owner is still writing it.
 */
function readLock(path = LOCK_PATH) {
    let text;
    try {
        text = readFileSync(path, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') return 'missing';
        throw error;
    }
    try {
        const holder = JSON.parse(text);
        return { text, holder: Number.isInteger(holder?.pid) ? holder : undefined };
    } catch {
        return { text, holder: undefined };
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
 * Removes the lock file if its text is still `stale`, and says whether it did.
 * The file is first moved aside under a name only this process uses, so of two
 * runs that both read the same stale file, only one removes it. If the moved
 * file is another run's fresh lock, it goes back. A third run that creates a
 * lock in the moment the file is aside would run beside that one; that window
 * is a few system calls wide.
 */
function takeOver(stale) {
    const aside = `${LOCK_PATH}.${process.pid}.stale`;
    try {
        renameSync(LOCK_PATH, aside);
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
    const moved = readLock(aside);
    if (moved !== 'missing' && moved.text === stale) {
        unlinkSync(aside);
        return true;
    }
    try {
        // Unlike a rename, a link fails rather than replace a lock created meanwhile.
        linkSync(aside, LOCK_PATH);
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
    unlinkSync(aside);
    return false;
}

/**
 * Removes the `.stale` and `.tmp` files of runs no longer running. A pid the
 * system has since given to another process keeps its file until that process
 * ends; the file is only clutter.
 */
function removeLeftoverFiles() {
    const directory = dirname(LOCK_PATH);
    for (const file of readdirSync(directory)) {
        const pid = Number(LEFTOVER_FILE.exec(file)?.[1]);
        if (!pid || isRunning(pid)) continue;
        try {
            unlinkSync(join(directory, file));
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }
}

/**
 * Whether the lock's owner is running: its pid is alive and started when the
 * record says. A record without a start time, or a system where `ps` gives
 * none, falls back to the pid alone.
 */
function holderIsRunning(holder) {
    if (!isRunning(holder.pid)) return false;
    if (holder.processStart === undefined) return true;
    const started = processStart(holder.pid);
    return started === undefined || started === holder.processStart;
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

/**
 * When the process `pid` started, as a string to compare, or undefined when
 * the system gives nothing (Windows). On Linux it is the start time in clock
 * ticks since boot, from `/proc/<pid>/stat`; `ps` derives its time from the
 * boot time, which Linux reports a second off now and then. Elsewhere it is
 * what `ps` prints (`lstart`, to the second, in the C locale).
 */
function processStart(pid) {
    if (process.platform === 'linux') {
        try {
            const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
            // The fields after the command name, which may hold spaces and
            // parentheses; the start time is the 22nd field of the line.
            return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
        } catch {
            return undefined;
        }
    }
    try {
        const output = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
            encoding: 'utf8',
            env: { ...process.env, LC_ALL: 'C' },
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return output === '' ? undefined : output;
    } catch {
        return undefined;
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
