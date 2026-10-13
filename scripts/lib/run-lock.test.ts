/**
 * Tests of the run lock (`scripts/lib/run-lock.ts`) through the processes that
 * take it. Each test points `TMPDIR` at a directory of its own, so it takes a
 * lock of its own and never waits on, or disturbs, a real run on this machine.
 * POSIX only, like the lock's process groups.
 */
import type { ChildProcess } from 'node:child_process';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
    existsSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { afterEach, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const lib = dirname(fileURLToPath(import.meta.url));
const runLockUrl = pathToFileURL(join(lib, 'run-lock.ts')).href;

/**
 * The arguments to `node` that run `command` through `runCommand` holding the
 * lock, and end as it ended, as `scripts/turbo.ts --lock` does.
 */
function runCommandArgs(command: string, ...args: string[]): string[] {
    return [
        '--input-type=module',
        '-e',
        `import { endAs, runCommand } from '${runLockUrl}';
endAs(await runCommand(${JSON.stringify(command)}, ${JSON.stringify(args)}, { env: process.env, lock: 'test' }));`,
    ];
}

/** Processes, process groups and directories to remove after each test. */
let processes: ChildProcess[] = [];
let groups: number[] = [];
let directories: string[] = [];

afterEach(() => {
    for (const child of processes) child.kill('SIGKILL');
    for (const group of groups) signalGroup(group, 'SIGKILL');
    for (const directory of directories)
        rmSync(directory, { recursive: true, force: true });
    processes = [];
    groups = [];
    directories = [];
});

/**
 * A temp directory for one test's lock, and the environment that points a run
 * at it. The variables a gate running this test would pass on are removed: the
 * holder variable would make every run here go ahead without the lock.
 */
function lockDirectory(): {
    directory: string;
    env: NodeJS.ProcessEnv;
    lockPath: string;
} {
    const directory = mkdtempSync(join(tmpdir(), 'astromech-run-lock-test-'));
    directories.push(directory);
    const { ASTROMECH_RUN_LOCK_PID: _holder, ...inherited } = process.env;
    const env = { ...inherited, TMPDIR: directory, ASTROMECH_FULL_SPEED: '1' };
    return { directory, env, lockPath: join(directory, 'astromech-run.lock') };
}

/** Starts `node <args>`, collecting its output, and resolves its exit with it. */
type Exit = { code: number | null; signal: NodeJS.Signals | null; output: string };

function start(
    args: string[],
    env: NodeJS.ProcessEnv
): { child: ChildProcess; exited: Promise<Exit>; output: () => string } {
    const child = spawn(process.execPath, args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    processes.push(child);
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const exited = new Promise<Exit>((fulfil) =>
        child.on('exit', (code, signal) => fulfil({ code, signal, output }))
    );
    return { child, exited, output: () => output };
}

/** A pid no process has: one that has just exited. */
async function exitedPid(): Promise<number> {
    const { child, exited } = start(['-e', ''], process.env);
    await exited;
    assert.ok(child.pid !== undefined);
    return child.pid;
}

/** Polls `read` until it returns something, or fails after `ms`. */
async function waitFor<T>(
    read: () => T | undefined | false,
    ms: number,
    describe: string
): Promise<T> {
    const deadline = Date.now() + ms;
    for (;;) {
        const value = read();
        if (value) return value;
        if (Date.now() > deadline) assert.fail(`timed out waiting for ${describe}`);
        await new Promise((fulfil) => setTimeout(fulfil, 50));
    }
}

function readGroups(lockPath: string): number[] | undefined {
    try {
        return (JSON.parse(readFileSync(lockPath, 'utf8')) as { groups?: number[] })
            .groups;
    } catch {
        return undefined;
    }
}

function signalGroup(group: number, signal: NodeJS.Signals | 0): boolean {
    try {
        process.kill(-group, signal);
        return true;
    } catch {
        return false;
    }
}

test('taking the lock removes the leftover files of runs that are not running', async () => {
    const { directory, env } = lockDirectory();
    const dead = await exitedPid();
    const leftovers = [
        `astromech-run.lock.${dead}.stale`,
        `astromech-run.lock.${dead}.tmp`,
    ];
    const live = `astromech-run.lock.${process.pid}.tmp`;
    for (const file of [...leftovers, live]) writeFileSync(join(directory, file), '{}');

    const run = start(
        [
            '--input-type=module',
            '-e',
            `import { waitForRunLock } from '${runLockUrl}'; await waitForRunLock('test');`,
        ],
        env
    );
    const { code, output } = await run.exited;

    assert.equal(code, 0, output);
    assert.deepEqual(readdirSync(directory), [live]);
});

test('runCommand with the lock records its command, which a run waits for after it is killed', async () => {
    const { env, lockPath } = lockDirectory();
    const wrapper = start(runCommandArgs('sleep', '30'), env);
    const [group] = await waitFor(
        () => readGroups(lockPath),
        5000,
        'the wrapper to record a process group'
    );
    groups.push(group);
    assert.ok(signalGroup(group, 0), 'the recorded group is running');

    wrapper.child.kill('SIGKILL');
    await wrapper.exited;
    assert.deepEqual(readGroups(lockPath), [group]);

    const waiter = start(
        [
            '--input-type=module',
            '-e',
            `import { waitForRunLock } from '${runLockUrl}'; await waitForRunLock('test');`,
        ],
        env
    );
    await waitFor(
        () => waiter.output().includes(`waiting for process group(s) ${group}`),
        5000,
        'the next run to wait for the group'
    );
});

test('runCommand with the lock under an ancestor leaves its lock file as it is', async () => {
    const { env, lockPath } = lockDirectory();
    const record = JSON.stringify({ pid: process.pid, name: 'ancestor', groups: [1] });
    writeFileSync(lockPath, record);

    const wrapper = start(runCommandArgs('true'), {
        ...env,
        ASTROMECH_RUN_LOCK_PID: String(process.pid),
    });
    const { code, output } = await wrapper.exited;

    assert.equal(code, 0, output);
    assert.ok(existsSync(lockPath));
    assert.equal(readFileSync(lockPath, 'utf8'), record);
});

test('runCommand with the lock passes Ctrl-C on to its command and releases the lock', async () => {
    const { env, lockPath } = lockDirectory();
    const wrapper = start(runCommandArgs('sleep', '30'), env);
    const [group] = await waitFor(
        () => readGroups(lockPath),
        5000,
        'the wrapper to record a process group'
    );
    groups.push(group);

    wrapper.child.kill('SIGINT');
    const { signal } = await wrapper.exited;

    assert.equal(signal, 'SIGINT');
    assert.equal(signalGroup(group, 0), false, 'the command has stopped');
    assert.equal(existsSync(lockPath), false);
});

test('runCommand with the lock lets a run its command starts go ahead without it', async () => {
    const { env } = lockDirectory();
    // As `scripts/turbo.ts --lock` runs a boot check, which takes the lock
    // too: with a copy of the environment made before the lock was taken.
    const nested = `import { waitForRunLock } from '${runLockUrl}';
console.log('nested run took the lock:', await waitForRunLock('nested'));`;
    const wrapper = start(
        [
            '--input-type=module',
            '-e',
            `import { endAs, runCommand } from '${runLockUrl}';
const env = { ...process.env };
endAs(await runCommand(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(nested)}], { env, lock: 'test' }));`,
        ],
        env
    );
    const { code, output } = await Promise.race([
        wrapper.exited,
        new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new Error(`the nested run waited: ${wrapper.output()}`)),
                10_000
            )
        ),
    ]);

    assert.equal(code, 0, output);
    assert.match(output, /nested run took the lock: false/);
});
