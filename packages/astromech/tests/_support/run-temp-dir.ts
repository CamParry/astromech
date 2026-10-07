/**
 * The temp directory one test run works in, made by `global-setup.ts`.
 *
 * Each run gets an `astromech-test-*` directory under the system temp dir.
 * Test support writes its run-wide files there (the template database, one
 * database per test, CLI sites, storage directories), and its `tmp/`
 * subdirectory stands in for the system temp dir inside the workers
 * (`tmpdir-setup.ts`), so a temp file a test makes itself lands there too.
 *
 * The teardown removes the directory, and fails the run when a test left
 * something behind that test support did not make, or when the directory
 * cannot be removed. A directory a killed run stranded (teardown never runs on
 * SIGKILL) is swept by the next run's setup.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** The prefix of every run's directory under the system temp dir. */
export const RUN_DIR_PREFIX = 'astromech-test-';

/** Holds the pid of the process that owns the run, the vitest main process. */
const OWNER_FILE = 'owner.pid';

/** The subdirectory the workers' `os.tmpdir()` reports. */
const TMP_DIR = 'tmp';

/**
 * How old a run directory with no owner file must be before a sweep removes
 * it. Only a directory made before owner files existed has none, and a run
 * that old is over: a suite takes minutes.
 */
const UNOWNED_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * What test support writes into a run's directory, by the name it gives each
 * entry. Anything else at teardown was left there by a test.
 */
const SUPPORT_ENTRIES = [
    // `createRunDir`
    /^owner\.pid$/,
    /^tmp$/,
    // `global-setup.ts`
    /^template\.db$/,
    // `createTestDb` in `harness.ts`, and the files SQLite keeps beside one
    /^[0-9a-f-]{36}\.db(-journal|-wal|-shm)?$/,
    // `createTestStorage` in `harness.ts`
    /^storage-[0-9a-f-]{36}$/,
    // `createTempSite` in `cli.ts`
    /^site-\w{6}$/,
];

/**
 * The caches tools keep in the temp dir, which a run's `tmp/` collects: jiti's,
 * from loading a site config, and tsx's, from a CLI child run from source.
 */
const TOOL_CACHES = [/^jiti$/, /^tsx-\d+$/];

/**
 * Make a run directory under `parent`, owned by this process, with an empty
 * `tmp/` inside it.
 */
export function createRunDir(parent: string = os.tmpdir()): string {
    const dir = fs.mkdtempSync(path.join(parent, RUN_DIR_PREFIX));
    fs.writeFileSync(path.join(dir, OWNER_FILE), String(process.pid));
    fs.mkdirSync(path.join(dir, TMP_DIR));
    return dir;
}

/** The directory the workers' `os.tmpdir()` reports during the run. */
export function runTmpDir(dir: string): string {
    return path.join(dir, TMP_DIR);
}

/**
 * Remove the run directories under `parent` whose run is over, and return
 * them. A run is over when the pid in its owner file is not running. Another
 * worktree's run on this machine has a live owner, however long it has run, so
 * its directory stays. A directory with no owner file is removed once it is
 * older than a day.
 */
export function sweepStaleRunDirs(
    parent: string = os.tmpdir(),
    now: number = Date.now()
): string[] {
    const removed: string[] = [];
    for (const name of fs.readdirSync(parent)) {
        if (!name.startsWith(RUN_DIR_PREFIX)) continue;
        const dir = path.join(parent, name);
        try {
            if (!isStale(dir, now)) continue;
            fs.rmSync(dir, { recursive: true, force: true });
            removed.push(dir);
        } catch {
            // Another run's sweep removed it first, or it belongs to another
            // user: either way it is not this run's to remove.
        }
    }
    return removed;
}

function isStale(dir: string, now: number): boolean {
    if (!fs.statSync(dir).isDirectory()) return false;
    let owner: string;
    try {
        owner = fs.readFileSync(path.join(dir, OWNER_FILE), 'utf8');
    } catch {
        return now - fs.statSync(dir).mtimeMs > UNOWNED_STALE_AFTER_MS;
    }
    const pid = Number(owner);
    if (!Number.isInteger(pid) || pid <= 0) return true;
    return !isRunning(pid);
}

/** Whether a process with this pid exists. */
function isRunning(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // EPERM: it exists, but belongs to another user.
        return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
}

/**
 * What a test left in the run directory: entries test support does not make,
 * and anything inside `tmp/` but a tool's cache. Paths are relative to `dir`.
 */
export function findLeftovers(dir: string): string[] {
    const unexpected = fs
        .readdirSync(dir)
        .filter((name) => !SUPPORT_ENTRIES.some((pattern) => pattern.test(name)));
    const tmp = runTmpDir(dir);
    const inTmp = fs.existsSync(tmp)
        ? fs
              .readdirSync(tmp)
              .filter((name) => !TOOL_CACHES.some((pattern) => pattern.test(name)))
              .map((name) => path.join(TMP_DIR, name))
        : [];
    return [...unexpected, ...inTmp].sort();
}

/**
 * Remove the run directory. Throws, after removing it, when a test left
 * something in it, and throws when it is still there afterwards.
 */
export function removeRunDir(dir: string): void {
    const leftovers = findLeftovers(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    if (fs.existsSync(dir)) {
        throw new Error(`The test run could not remove its temp directory ${dir}`);
    }
    if (leftovers.length > 0) {
        throw new Error(
            `A test left files in the run's temp directory ${dir}:\n` +
                leftovers.map((entry) => `  ${entry}\n`).join('') +
                'A test removes the temp files it makes (in afterAll or ' +
                'onTestFinished). If test support or a tool made one, add its ' +
                'name to SUPPORT_ENTRIES or TOOL_CACHES in ' +
                'tests/_support/run-temp-dir.ts.'
        );
    }
}
