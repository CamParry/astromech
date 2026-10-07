/**
 * The run's temp directory (`@tests/run-temp-dir`): the sweep of directories
 * killed runs left, and the teardown check that fails a run when a test left
 * files behind. Each case works in a parent directory of its own, never in the
 * system temp dir, where other runs on this machine keep theirs.
 */
import { spawnSync } from 'node:child_process';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    utimesSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    createRunDir,
    findLeftovers,
    removeRunDir,
    RUN_DIR_PREFIX,
    runTmpDir,
    sweepStaleRunDirs,
} from '@tests/run-temp-dir';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';

let parent: string;

beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'run-temp-dir-'));
});

afterEach(() => {
    chmodSync(parent, 0o700);
    rmSync(parent, { recursive: true, force: true });
});

/** A pid no process has: one that ran and exited. */
function finishedPid(): number {
    const { pid } = spawnSync(process.execPath, ['-e', '']);
    if (pid === undefined) throw new Error('the child process did not start');
    return pid;
}

/** A run directory whose owner file names `pid`. */
function runDirOwnedBy(pid: number): string {
    const dir = createRunDir(parent);
    writeFileSync(join(dir, 'owner.pid'), String(pid));
    return dir;
}

describe('sweepStaleRunDirs', () => {
    it('removes a run directory whose owner is no longer running', () => {
        const dir = runDirOwnedBy(finishedPid());

        expect(sweepStaleRunDirs(parent)).toEqual([dir]);
        expect(existsSync(dir)).toBe(false);
    });

    it('keeps a run directory whose owner is running, as a concurrent run is', () => {
        const dir = createRunDir(parent);

        expect(sweepStaleRunDirs(parent)).toEqual([]);
        expect(existsSync(dir)).toBe(true);
    });

    it('removes an unowned run directory only once it is a day old', () => {
        const dir = mkdtempSync(join(parent, RUN_DIR_PREFIX));
        const now = Date.now();

        expect(sweepStaleRunDirs(parent, now)).toEqual([]);

        const twoDaysAgo = (now - 2 * 24 * 60 * 60 * 1000) / 1000;
        utimesSync(dir, twoDaysAgo, twoDaysAgo);
        expect(sweepStaleRunDirs(parent, now)).toEqual([dir]);
    });

    it('leaves directories without the run prefix alone', () => {
        const other = join(parent, 'something-else');
        mkdirSync(other);
        const old = (Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000;
        utimesSync(other, old, old);

        expect(sweepStaleRunDirs(parent)).toEqual([]);
        expect(existsSync(other)).toBe(true);
    });
});

describe('findLeftovers', () => {
    it('accepts what test support writes', () => {
        const dir = createRunDir(parent);
        const id = crypto.randomUUID();
        for (const name of ['template.db', `${id}.db`, `${id}.db-journal`]) {
            writeFileSync(join(dir, name), '');
        }
        mkdirSync(join(dir, `storage-${crypto.randomUUID()}`));
        mkdtempSync(join(dir, 'site-'));

        expect(findLeftovers(dir)).toEqual([]);
    });

    it('accepts the caches tools keep in the temp dir', () => {
        const dir = createRunDir(parent);
        mkdirSync(join(runTmpDir(dir), 'jiti'));
        mkdirSync(join(runTmpDir(dir), 'tsx-501'));

        expect(findLeftovers(dir)).toEqual([]);
    });

    it('reports a directory a test made in the run directory and did not remove', () => {
        const dir = createRunDir(parent);
        const wranglerProject = mkdtempSync(join(dir, 'wrangler-'));

        expect(findLeftovers(dir)).toEqual([wranglerProject.slice(dir.length + 1)]);
    });

    // The 35 GB leak: test support made an `astromech-test-<pid>-*` directory
    // per worker in the system temp dir and removed it from
    // `process.on('exit')`, which a worker thread never fires. With the
    // workers' temp dir inside the run directory, that directory is found.
    it('reports a directory a test made in the temp dir and did not remove', () => {
        const dir = createRunDir(parent);
        const leaked = mkdtempSync(
            join(runTmpDir(dir), `astromech-test-${process.pid}-`)
        );

        expect(findLeftovers(dir)).toEqual([leaked.slice(dir.length + 1)]);
    });
});

describe('removeRunDir', () => {
    it('removes a run directory a test left clean', () => {
        const dir = createRunDir(parent);

        removeRunDir(dir);

        expect(existsSync(dir)).toBe(false);
    });

    it('removes the directory, then fails, naming what a test left', () => {
        const dir = createRunDir(parent);
        mkdirSync(join(runTmpDir(dir), 'forgotten'));

        expect(() => removeRunDir(dir)).toThrow(/tmp\/forgotten/);
        expect(existsSync(dir)).toBe(false);
    });

    it.skipIf(process.getuid?.() === 0)(
        'fails when the directory cannot be removed',
        () => {
            const dir = createRunDir(parent);
            chmodSync(parent, 0o500);

            expect(() => removeRunDir(dir)).toThrow();
            chmodSync(parent, 0o700);
            expect(existsSync(dir)).toBe(true);
        }
    );
});

describe("the workers' temp dir", () => {
    it("is the run directory's tmp/", () => {
        expect(tmpdir()).toBe(inject('testTmpDir'));
    });
});
