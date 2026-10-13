/**
 * Tests of the gate's helpers (`scripts/lib/gate.ts`) that need no Turborepo run:
 * the scope, each mode's tasks, the environment, the arguments, the log names
 * and the skipped tasks, and the builds `check:node-imports` and the two
 * `check:install` tasks wait for. The
 * scope tests use throwaway git repositories; the task tests read this
 * repository's workspace and `turbo.json`.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    gateScope,
    logPath,
    skippedTasks,
    tasksForMode,
    turboEnvironment,
    turboRunArguments,
} from './gate.ts';
import { workspacePackages } from './workspace-packages.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// A git hook runs these tests with `GIT_INDEX_FILE` and `GIT_DIR` naming the
// repository being committed to. Inherited, they would send the throwaway
// repositories' writes to its index, and the scope's reads to its history.
// The user's own config, such as commit signing, stays out too.
for (const name of Object.keys(process.env)) {
    if (name.startsWith('GIT_')) Reflect.deleteProperty(process.env, name);
}
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
process.env.GIT_CONFIG_NOSYSTEM = '1';

let directories: string[] = [];
const savedBase = process.env.TURBO_SCM_BASE;

afterEach(() => {
    for (const directory of directories) {
        rmSync(directory, { recursive: true, force: true });
    }
    directories = [];
    if (savedBase === undefined) delete process.env.TURBO_SCM_BASE;
    else process.env.TURBO_SCM_BASE = savedBase;
});

/** A repository with one commit on `main`, and `topic` one commit ahead of it. */
function repository(): string {
    const directory = mkdtempSync(join(tmpdir(), 'astromech-gate-test-'));
    directories.push(directory);
    const git = (...args: string[]): Buffer =>
        execFileSync('git', args, {
            cwd: directory,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(directory, 'a.txt'), 'a\n');
    git('add', '.');
    git('commit', '-q', '-m', 'first');
    git('switch', '-q', '-c', 'topic');
    writeFileSync(join(directory, 'b.txt'), 'b\n');
    git('add', '.');
    git('commit', '-q', '-m', 'second');
    return directory;
}

test('the scope is the merge base with the base the variable names', () => {
    const directory = repository();
    process.env.TURBO_SCM_BASE = 'main';
    const scope = gateScope(directory);
    assert.equal(scope.affected, true);
    assert.equal(scope.base, 'main');
    assert.match(
        scope.line,
        /^scope: tasks affected since main \(merge base [0-9a-f]{8}\)/
    );
});

test('a checkout without the base runs every task, and says why', () => {
    const directory = repository();
    delete process.env.TURBO_SCM_BASE;
    const scope = gateScope(directory);
    assert.equal(scope.affected, false);
    assert.equal(
        scope.line,
        'scope: every task (origin/main is missing or shares no commit with HEAD)'
    );
});

test('--all runs every task', () => {
    const directory = repository();
    process.env.TURBO_SCM_BASE = 'main';
    assert.deepEqual(gateScope(directory, { all: true }), {
        affected: false,
        line: 'scope: every task (--all)',
    });
});

test('the run asks for --affected only when the scope is affected', () => {
    assert.deepEqual(
        turboRunArguments(repoRoot, 'runtime', { affected: true, base: 'main' }),
        ['run', ...tasksForMode(repoRoot, 'runtime'), '--affected']
    );
    assert.deepEqual(turboRunArguments(repoRoot, 'runtime', { affected: false }), [
        'run',
        ...tasksForMode(repoRoot, 'runtime'),
    ]);
});

test('fast mode asks for no build, and full asks for every task fast does', () => {
    const fast = tasksForMode(repoRoot, 'fast');
    const full = tasksForMode(repoRoot, 'full');
    assert.equal(
        fast.some((task) => task.includes('build') || task.includes('boot')),
        false
    );
    for (const task of fast) {
        // `full` asks for `typecheck` in every package, `fast` for some.
        const name = task.startsWith('//#') ? task : task.replace(/^.+#/, '');
        assert.ok(full.includes(task) || full.includes(name), task);
    }
});

test('fast mode type-checks every package outside apps/, and not the apps', () => {
    const typechecks = tasksForMode(repoRoot, 'fast').filter((task) =>
        task.endsWith('#typecheck')
    );
    const expected = workspacePackages(repoRoot)
        .filter(
            ({ manifest }) =>
                manifest.private !== true || manifest.name === '@astromech/scripts'
        )
        .map(({ name }) => `${name}#typecheck`);
    assert.deepEqual(typechecks.toSorted(), expected.toSorted());
    assert.ok(typechecks.includes('astromech#typecheck'));
    assert.ok(typechecks.includes('@astromech/scripts#typecheck'));
    assert.equal(
        typechecks.some((task) => task.startsWith('astromech-demo')),
        false
    );
});

/** A `turbo.json` under the repository root, which is JSON with whole-line comments. */
function readTurboConfig(path: string): {
    tasks: Record<string, { dependsOn?: string[] }>;
} {
    return JSON.parse(
        readFileSync(join(repoRoot, path), 'utf8')
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n')
    );
}

/** Every published package's `build`, as a task id. */
function publishedBuilds(): string[] {
    return workspacePackages(repoRoot)
        .filter(({ manifest }) => manifest.private !== true)
        .map(({ name }) => `${name}#build`)
        .toSorted();
}

test('check:node-imports waits for every package build', () => {
    const task = readTurboConfig('turbo.json').tasks['//#check:node-imports'];
    assert.deepEqual(task?.dependsOn?.toSorted(), publishedBuilds());
});

test('check:install waits for every package build, with either package manager', () => {
    const { tasks } = readTurboConfig('scripts/turbo.json');
    for (const name of ['check:install', 'check:install:pnpm']) {
        assert.deepEqual(tasks[name]?.dependsOn?.toSorted(), publishedBuilds(), name);
    }
});

test('the environment drops NODE_ENV, and only runtime mode skips declarations', () => {
    const directory = repository();
    const shell = { PATH: '/bin', NODE_ENV: 'production', ASTROMECH_NO_DTS: '1' };
    const scope = { affected: true, base: 'main' };
    // A gate running this test sets the variable; this asks for the default.
    const cacheDirectory = process.env.TURBO_CACHE_DIR;
    delete process.env.TURBO_CACHE_DIR;
    const full = turboEnvironment(directory, 'full', scope, shell);
    if (cacheDirectory !== undefined) process.env.TURBO_CACHE_DIR = cacheDirectory;
    assert.equal(full.NODE_ENV, undefined);
    assert.equal(full.ASTROMECH_NO_DTS, undefined);
    assert.equal(full.TURBO_SCM_BASE, 'main');
    assert.equal(full.ASTROMECH_NODE_MAJOR, process.versions.node.split('.')[0]);
    assert.equal(
        full.TURBO_CACHE_DIR,
        join(realpathSync(directory), '.git', 'turbo-cache')
    );
    const runtime = turboEnvironment(directory, 'runtime', { affected: false }, shell);
    assert.equal(runtime.ASTROMECH_NO_DTS, '1');
    assert.equal(runtime.TURBO_SCM_BASE, undefined);
});

test('a task id becomes a file name', () => {
    assert.equal(logPath('/v', '@astromech/admin#lint'), '/v/@astromech-admin#lint.log');
    assert.equal(logPath('/v', '//#check:docs'), '/v/root#check:docs.log');
});

test('a task that did not run traces to the failed task it depends on', () => {
    const plan = [
        { taskId: 'a#build', dependencies: [] },
        { taskId: 'b#build', dependencies: ['a#build'] },
        { taskId: 'demo#check:boot', dependencies: ['b#build'] },
        { taskId: '//#check:docs', dependencies: [] },
    ];
    const executed = new Set(['a#build', '//#check:docs']);
    assert.deepEqual(skippedTasks(plan, executed, new Set(['a#build'])), [
        { taskId: 'b#build', needs: 'a#build' },
        { taskId: 'demo#check:boot', needs: 'a#build' },
    ]);
});

test('a task that did not run with no failed dependency traces to nothing', () => {
    const plan = [{ taskId: 'a#build', dependencies: [] }];
    assert.deepEqual(skippedTasks(plan, new Set(), new Set()), [
        { taskId: 'a#build', needs: undefined },
    ]);
});
