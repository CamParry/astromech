/**
 * What the gate (`scripts/verify.mjs`) runs, how it calls Turborepo, where it
 * leaves its logs, and whether a run would be all cache hits.
 *
 * Each mode is one `turbo run` over the tasks in `turbo.json`:
 *
 * - `fast` runs no build: the packages' `typecheck`, `test:coverage` and
 *   `lint`, and `check:unused`, `check:hooks`, `check:scripts`, `lint:scripts`
 *   and `format:check`. The demo apps' `typecheck` reads the builds, so fast
 *   mode names each package's `typecheck` (`<package>#typecheck`) for every
 *   package that is not private, read from the workspace. A `--filter` that
 *   leaves out the apps does not do it: with `--affected`, Turborepo drops the
 *   apps' tasks but keeps the builds they depend on.
 * - `full` runs every task, the builds, the apps' typecheck and the boot
 *   checks included.
 * - `runtime` runs the tests and the two boot checks, over builds without
 *   declarations (`ASTROMECH_NO_DTS`, which `build` lists in its `env`), for
 *   CI's second Node version.
 *
 * Fast and full share `test:coverage`, so a fast pass is a cache hit in full.
 *
 * A run is scoped with `--affected` to the tasks whose inputs differ from the
 * merge base with `origin/main` (`TURBO_SCM_BASE`, when set, names another
 * base), uncommitted and untracked files included. `--all` drops the scope, and
 * so does a checkout with no merge base, where the scope line says why.
 *
 * Every turbo call here gets `TURBO_CACHE_DIR`, so every worktree of this
 * repository shares one cache: `turbo-cache` in the git common directory,
 * which git never tracks and which outlives a removed worktree. CI sets the
 * variable to the directory it saves between runs. `ASTROMECH_NODE_MAJOR` is
 * in `turbo.json`'s `globalEnv`, so a result from one Node major is never
 * reused on another.
 *
 * Logs live in `verify/` in the worktree's own git directory
 * (`git rev-parse --absolute-git-dir`): `<task>.log` for each task of the last
 * run, and `turbo.log` for Turborepo's own output.
 *
 * `gateStatus` asks Turborepo for the same run with `--dry=json` and reads
 * each task's cache status, so it runs nothing and does not wait for the run
 * lock. It matches when every task the mode would run is a cache hit.
 * `pnpm run verify:status` prints it and `pnpm run land` refuses without it.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { workspacePackages } from './workspace-packages.mjs';

export const MODES = ['fast', 'full', 'runtime'];

/**
 * The tasks each mode asks for. Turborepo adds the tasks they depend on.
 * `PACKAGE_TYPECHECKS` stands for each package's `typecheck` (the header).
 */
const PACKAGE_TYPECHECKS = Symbol('package typechecks');
const TASKS = {
    fast: [
        PACKAGE_TYPECHECKS,
        'test:coverage',
        'lint',
        '//#check:unused',
        '//#check:hooks',
        '//#check:scripts',
        '//#lint:scripts',
        '//#format:check',
    ],
    full: [
        'build',
        'typecheck',
        'test:coverage',
        'lint',
        '//#check:unused',
        '//#check:hooks',
        '//#check:scripts',
        '//#lint:scripts',
        '//#format:check',
        '//#check:docs',
        '//#check:exports',
        '//#check:node-imports',
        'check:boot',
        'check:boot:cloudflare',
    ],
    runtime: ['test:coverage', 'check:boot', 'check:boot:cloudflare'],
};

/** The base `--affected` compares against, unless `TURBO_SCM_BASE` names one. */
const DEFAULT_BASE = 'origin/main';

/** Turborepo's command for a task that no package defines a script for. */
const NO_COMMAND = '<NONEXISTENT>';

/** The tasks `mode` asks Turborepo for. */
export function tasksForMode(repoRoot, mode) {
    const tasks = TASKS[mode];
    if (tasks === undefined) throw new Error(`unknown gate mode: ${mode}`);
    return tasks.flatMap((task) =>
        task === PACKAGE_TYPECHECKS
            ? workspacePackages(repoRoot)
                  .filter(
                      ({ manifest }) =>
                          manifest.private !== true &&
                          manifest.scripts?.typecheck !== undefined
                  )
                  .map(({ name }) => `${name}#typecheck`)
            : [task]
    );
}

/** The worktree's `verify/` directory. It may not exist yet. */
export function verifyDirectory(repoRoot) {
    return join(git(repoRoot, 'rev-parse', '--absolute-git-dir'), 'verify');
}

/**
 * Creates the `verify/` directory and removes what an earlier run left in it.
 */
export function prepareVerifyDirectory(repoRoot) {
    const directory = verifyDirectory(repoRoot);
    mkdirSync(directory, { recursive: true });
    for (const entry of readdirSync(directory)) {
        if (entry.endsWith('.log')) {
            rmSync(join(directory, entry));
        }
    }
    return directory;
}

/** Where a task's log goes: `@astromech/admin#lint` to `@astromech-admin#lint.log`. */
export function logPath(directory, taskId) {
    const name = taskId.replace(/^\/\/#/, 'root#').replaceAll('/', '-');
    return join(directory, `${name}.log`);
}

/** The one cache every worktree shares, unless `TURBO_CACHE_DIR` names another. */
export function turboCacheDirectory(repoRoot) {
    return (
        process.env.TURBO_CACHE_DIR ||
        join(
            git(repoRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir'),
            'turbo-cache'
        )
    );
}

/**
 * Whether a run is scoped with `--affected`, and the line that says so.
 * `all` is the `--all` flag.
 */
export function gateScope(repoRoot, { all = false } = {}) {
    if (all) return { affected: false, line: 'scope: every task (--all)' };
    const base = process.env.TURBO_SCM_BASE || DEFAULT_BASE;
    let mergeBase;
    try {
        mergeBase = git(repoRoot, 'merge-base', base, 'HEAD');
    } catch {
        return {
            affected: false,
            line: `scope: every task (${base} is missing or shares no commit with HEAD)`,
        };
    }
    return {
        affected: true,
        base,
        line: `scope: tasks affected since ${base} (merge base ${mergeBase.slice(0, 8)}), uncommitted changes included`,
    };
}

/**
 * The environment a turbo call runs in: `base` without `NODE_ENV`, which
 * each tool sets for itself (`scripts/check-helpers.mjs`), plus the variables
 * the header names.
 */
export function turboEnvironment(repoRoot, mode, scope, base = process.env) {
    const { NODE_ENV: _nodeEnv, ASTROMECH_NO_DTS: _noDts, ...environment } = base;
    return {
        ...environment,
        TURBO_CACHE_DIR: turboCacheDirectory(repoRoot),
        TURBO_TELEMETRY_DISABLED: '1',
        ASTROMECH_NODE_MAJOR: process.versions.node.split('.')[0],
        ...(scope.affected ? { TURBO_SCM_BASE: scope.base } : {}),
        ...(mode === 'runtime' ? { ASTROMECH_NO_DTS: '1' } : {}),
    };
}

/** `turbo run` and the mode's tasks, with `--affected` when the scope says so. */
export function turboRunArguments(repoRoot, mode, scope) {
    return [
        'run',
        ...tasksForMode(repoRoot, mode),
        ...(scope.affected ? ['--affected'] : []),
    ];
}

/** The repository's own turbo binary. */
export function turboBinary(repoRoot) {
    return join(repoRoot, 'node_modules', '.bin', 'turbo');
}

/**
 * The tasks a run of `mode` would run, from `turbo run --dry=json`: each with
 * its id, its cache status (`HIT` or `MISS`), the tasks it depends on and its
 * log file relative to the repository root. Tasks with no command are left out.
 * `scope` defaults to every task.
 */
export function dryRun(repoRoot, mode, scope = { affected: false }) {
    const result = spawnSync(
        turboBinary(repoRoot),
        [...turboRunArguments(repoRoot, mode, scope), '--dry=json'],
        {
            cwd: repoRoot,
            env: turboEnvironment(repoRoot, mode, scope),
            encoding: 'utf8',
            maxBuffer: 256 * 1024 * 1024,
        }
    );
    if (result.status !== 0) {
        throw new Error(
            `turbo --dry=json failed (exit ${result.status ?? result.signal}):\n${result.stderr}`
        );
    }
    return JSON.parse(result.stdout)
        .tasks.filter((task) => task.command !== NO_COMMAND)
        .map((task) => ({
            taskId: task.taskId,
            status: task.cache.status,
            dependencies: task.dependencies,
            logFile: task.logFile,
        }));
}

/**
 * Whether every task a run of `mode` would run is already a cache hit, with a
 * line saying why. `all` is the `--all` flag.
 */
export function gateStatus(repoRoot, mode, { all = false } = {}) {
    const scope = gateScope(repoRoot, { all });
    const tasks = dryRun(repoRoot, mode, scope);
    const misses = tasks.filter((task) => task.status !== 'HIT');
    const where = scope.affected ? ` affected since ${scope.base}` : '';
    if (tasks.length === 0) {
        return { matches: true, tasks, message: `no ${mode} task is${where}` };
    }
    if (misses.length === 0) {
        return {
            matches: true,
            tasks,
            message: `all ${tasks.length} ${mode} tasks${where} are cache hits`,
        };
    }
    const named = misses
        .slice(0, 5)
        .map((task) => task.taskId)
        .join(', ');
    const more = misses.length > 5 ? `, and ${misses.length - 5} more` : '';
    return {
        matches: false,
        tasks,
        message: `${misses.length} of ${tasks.length} ${mode} tasks${where} would run: ${named}${more}`,
    };
}

/**
 * The planned tasks a run did not execute, each with the failed task it traces
 * to through `dependencies`. `failed` holds the ids of the tasks that failed.
 * A task with no failed task among its dependencies, as after a run that
 * stopped early, traces to undefined.
 */
export function skippedTasks(plan, executed, failed) {
    const byId = new Map(plan.map((task) => [task.taskId, task]));
    const failedDependency = (taskId, seen = new Set()) => {
        if (seen.has(taskId)) return undefined;
        seen.add(taskId);
        for (const dependency of byId.get(taskId)?.dependencies ?? []) {
            if (failed.has(dependency)) return dependency;
            const found = failedDependency(dependency, seen);
            if (found !== undefined) return found;
        }
        return undefined;
    };
    return plan
        .filter((task) => !executed.has(task.taskId))
        .map((task) => ({ taskId: task.taskId, needs: failedDependency(task.taskId) }));
}

function git(repoRoot, ...args) {
    return execFileSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
}
