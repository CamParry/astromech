/**
 * Runs the gate, in stages, with everything that can overlap overlapping.
 *
 * `--fast` runs only the stages that need no build: the published packages'
 * typechecks, their test suites, lint and `check:unused`. That is the loop to
 * run while working. The full run adds the build and everything downstream of it.
 * Fast mode checks coverage thresholds only for the packages the branch
 * changes since its merge base with `origin/main` (committed, staged, unstaged
 * or untracked), and prints which ones; the other suites run without coverage.
 * The full and runtime modes check coverage in every package.
 *
 * `--runtime` runs only the checks whose result can vary with the Node version:
 * the test suites and the two boot checks, over a `build:js` (no declarations,
 * which no runtime reads). CI runs the full gate on one Node version and this
 * subset on the other, so version-invariant work is never doubled while
 * test and boot still run on both. See `.github/workflows/ci.yml`.
 *
 * Two things decide the stage boundaries, and neither is arbitrary:
 *
 * - Anything reading `dist` waits for `build`.
 * - `tsr generate` writes `packages/admin/src/routeTree.gen.ts`, and
 *   so does the TanStack Router Vite plugin inside each app build. `typecheck`
 *   gets a stage of its own for this reason. The two boot checks then run
 *   together, but only after a `routes:generate` stage writes that file first:
 *   the generator reads the existing file and skips the write when the content
 *   is unchanged, so once it is current both app builds read it and neither
 *   writes, and the race is gone.
 *
 * A failed check does not stop the gate. Only the build stages and
 * `routes:generate` write something a later check reads, so a check that
 * reads one (its `needs`) is skipped when that one fails, with a
 * `skip <name> (needs <failed>)` line, and every other check still runs. The
 * summary at the end prints each failure's output. Within the test stage, each
 * package's suite runs even when an earlier package's fails.
 *
 * Run locally on macOS, the gate leaves the machine usable: it runs at a lower
 * priority, the tests run fewer workers, and typecheck and lint check fewer
 * packages at once (`scripts/cpu-limits.mjs`). CI runs at full speed, and so
 * does a local run with `ASTROMECH_FULL_SPEED=1` set.
 *
 * Every mode first takes the lock in `scripts/run-lock.mjs`, so
 * a second gate, build, test run or boot check started meanwhile, in any
 * worktree, waits for this one to finish rather than run beside it. The checks
 * this starts go ahead under its lock, and the lock file lists their process
 * groups, so a gate killed outright still holds the lock until they end.
 *
 * Each check's whole output goes to a log file in the worktree's git
 * directory, `verify/<check>.log`, and a `FAIL` line names its path. To see
 * more of a failure, search that log; don't rerun the check. A passing run
 * writes `verify/stamp.json` there, recording the mode and the git tree id of
 * the working tree, and a failed run removes it. `pnpm run verify:status`
 * reads it, so a run already made on the same content need not be repeated,
 * before or after that content is committed. A run whose tree changes while it
 * runs writes no stamp. `scripts/verify-stamp.mjs`
 * has the detail.
 */

import { execFileSync, spawn } from 'node:child_process';
import console from 'node:console';
import { createWriteStream, existsSync, readdirSync, readFileSync } from 'node:fs';
import { constants } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { environmentWithoutNodeEnv } from './check-helpers.mjs';
import {
    cpuLimitsApply,
    relaunchAtLowerPriority,
    WORKSPACE_CONCURRENCY,
} from './cpu-limits.mjs';
import { stopProcessGroup } from './process-group.mjs';
import { recordProcessGroups, waitForRunLock } from './run-lock.mjs';
import {
    logPath,
    prepareVerifyDirectory,
    removeStamp,
    stampPath,
    treeState,
    writeStamp,
} from './verify-stamp.mjs';

// First, before anything prints: every check inherits the priority.
relaunchAtLowerPriority();

// Before any check starts, and before the environment below is copied, since
// the lock sets the variable that lets the checks skip it.
await waitForRunLock('verify');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const verifyDirectory = prepareVerifyDirectory(repoRoot);

/** The tree the checks start from, compared with the tree at the end. */
const startingTree = treeState(repoRoot);

// Each check runs with the tool's own `NODE_ENV`, whatever the shell sets.
const environment = environmentWithoutNodeEnv('verify');

// For a check that runs `pnpm -r` beside the tests. A limited run caps how many
// packages it runs at once. pnpm 11 reads `pnpm_config_*` variables, not
// `npm_config_*`.
const besideTestsEnvironment = cpuLimitsApply
    ? {
          ...environment,
          pnpm_config_workspace_concurrency: String(WORKSPACE_CONCURRENCY),
      }
    : environment;

// The slowest healthy check, `test:run`, takes about eight minutes on a CI
// runner, so this trips only on a hang. It sits inside the CI jobs'
// `timeout-minutes`, so the check's output is still printed.
const CHECK_TIMEOUT_MS = 15 * 60_000;

/** Longer than a boot check's own 5 s cleanup, so that cleanup can finish. */
const STOP_GRACE_MS = 10_000;

/** How long a check's output may stay open after the check itself exits. */
const PIPE_GRACE_MS = 5000;

// Lines vitest (and most tools) use to name a failure, for a failing check's
// summary. `[ERROR]` and `Summary:` are pnpm's lines naming each package whose
// script failed in a recursive run.
const SUMMARY_PATTERN =
    /FAIL|✗|×|AssertionError|Error:|Test Files|Tests |ERROR: Coverage|\[ERROR\]|^Summary: /;
const SUMMARY_LINES = 60;

const mode = process.argv.includes('--fast')
    ? 'fast'
    : process.argv.includes('--runtime')
      ? 'runtime'
      : 'full';

/** Only fast mode reads the branch's changes. */
const fastTestCommand = mode === 'fast' ? testCommandForBranch() : undefined;

/**
 * Each stage runs in parallel; stages run in order. A check lists in `needs`
 * the earlier checks whose output it reads, and is skipped when one of them
 * fails. Every other check runs whatever failed before it. A check's `env`,
 * when set, replaces the environment it runs in.
 */
const stagesByMode = {
    fast: [
        [
            {
                name: 'typecheck:packages',
                command: 'pnpm -r -F "./packages/**" typecheck',
                env: besideTestsEnvironment,
            },
            // Every plugin resolves core to source, so this stage needs no build.
            { name: 'test:packages', command: fastTestCommand },
            { name: 'lint', command: 'pnpm run lint', env: besideTestsEnvironment },
            { name: 'check:unused', command: 'pnpm run check:unused' },
        ],
    ],
    runtime: [
        // No declarations: nothing this mode runs reads a `.d.ts`.
        [{ name: 'build:js', command: 'pnpm run build:js' }],
        // routes:generate primes routeTree.gen.ts for the concurrent boot
        // builds below (see the header comment); test:run is independent of it.
        [
            { name: 'test:run', command: 'pnpm run test:run' },
            {
                name: 'routes:generate',
                command: 'pnpm -F @astromech/admin routes:generate',
            },
        ],
        [
            {
                name: 'check:boot',
                command: 'pnpm run check:boot',
                needs: ['build:js', 'routes:generate'],
            },
            {
                name: 'check:boot:cloudflare',
                command: 'pnpm run check:boot:cloudflare',
                needs: ['build:js', 'routes:generate'],
            },
        ],
    ],
    full: [
        [{ name: 'build', command: 'pnpm run build' }],
        [
            { name: 'test:run', command: 'pnpm run test:run' },
            { name: 'lint', command: 'pnpm run lint', env: besideTestsEnvironment },
            { name: 'check:unused', command: 'pnpm run check:unused' },
            {
                name: 'check:node-imports',
                command: 'pnpm run check:node-imports',
                needs: ['build'],
            },
            { name: 'check:exports', command: 'pnpm run check:exports' },
            { name: 'check:docs', command: 'pnpm run check:docs' },
        ],
        // The demo apps import the packages through `exports`, which points at
        // `dist`, so their typecheck reads the build's declarations.
        [{ name: 'typecheck', command: 'pnpm run typecheck', needs: ['build'] }],
        // Prime routeTree.gen.ts so the two boot builds below both read it
        // unchanged and neither writes it. See the header comment.
        [
            {
                name: 'routes:generate',
                command: 'pnpm -F @astromech/admin routes:generate',
            },
        ],
        [
            {
                name: 'check:boot',
                command: 'pnpm run check:boot',
                needs: ['build', 'routes:generate'],
            },
            {
                name: 'check:boot:cloudflare',
                command: 'pnpm run check:boot:cloudflare',
                needs: ['build', 'routes:generate'],
            },
        ],
    ],
};

const stages = stagesByMode[mode];

/** Checks still running, each the leader of its own process group. */
const running = new Set();

/**
 * Keeps the lock file's list of running checks current, so a run that finds
 * this gate killed outright waits for the checks it left behind.
 */
const recordRunning = () =>
    recordProcessGroups([...running].map((child) => child.pid).filter(Boolean));

const run = (name, command, env = environment) =>
    new Promise((done) => {
        const started = Date.now();
        const child = spawn(command, {
            cwd: repoRoot,
            env,
            shell: true,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        running.add(child);
        recordRunning();
        const log = logPath(verifyDirectory, name);
        const logStream = createWriteStream(log);
        let output = '';
        const record = (chunk) => {
            output += chunk;
            logStream.write(chunk);
        };
        child.stdout.on('data', record);
        child.stderr.on('data', record);

        let timedOut = false;
        let heldOpen = false;
        let stopping;
        let pipeTimer;
        const deadline = setTimeout(() => {
            timedOut = true;
            stopping = stopProcessGroup(child, STOP_GRACE_MS);
        }, CHECK_TIMEOUT_MS);

        let settled = false;
        const settle = async (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(deadline);
            clearTimeout(pipeTimer);
            await stopping;
            child.stdout.destroy();
            child.stderr.destroy();
            await new Promise((fulfil) => logStream.end(fulfil));
            running.delete(child);
            recordRunning();
            const failed = timedOut || code !== 0;
            const seconds = ((Date.now() - started) / 1000).toFixed(1);
            const note = timedOut ? ', timed out' : '';
            console.log(
                failed
                    ? `FAIL ${name} (${seconds}s${note}) log: ${log}`
                    : `ok   ${name} (${seconds}s)`
            );
            if (heldOpen) {
                console.log(
                    `warn ${name} exited, but a process it started held its output open and was stopped`
                );
            }
            done({ name, failed, timedOut, output, log });
        };

        // `close` waits for the output pipes as well as the process. A process
        // the check started can outlive it and hold them open, so `exit` also
        // settles the check, a little later, and stops whatever is left.
        child.on('exit', (code) => {
            pipeTimer = setTimeout(() => {
                heldOpen = !timedOut;
                stopping ??= stopProcessGroup(child, STOP_GRACE_MS);
                void settle(code);
            }, PIPE_GRACE_MS);
        });
        child.on('close', (code) => void settle(code));
    });

let interrupted = false;

// Each check leads its own process group, which a Ctrl-C at the terminal or a
// closed terminal does not reach, so the signal is passed on to every check
// still running.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(signal, () => {
        interrupted = true;
        console.error(`\n${signal}: stopping ${running.size} running check(s)`);
        const stops = [...running].map((child) => stopProcessGroup(child, STOP_GRACE_MS));
        void Promise.all(stops).finally(() =>
            process.exit(128 + constants.signals[signal])
        );
    });
}

const failures = [];

/** Each check that failed or was skipped, mapped to the failed check it traces to. */
const unavailable = new Map();

for (const stage of stages) {
    if (interrupted) break;
    const runnable = [];
    for (const check of stage) {
        const missing = (check.needs ?? []).find((need) => unavailable.has(need));
        if (missing === undefined) {
            runnable.push(check);
        } else {
            const failed = unavailable.get(missing);
            unavailable.set(check.name, failed);
            console.log(`skip ${check.name} (needs ${failed})`);
        }
    }
    const results = await Promise.all(
        runnable.map(({ name, command, env }) => run(name, command, env))
    );
    for (const result of results.filter(({ failed }) => failed)) {
        failures.push(result);
        unavailable.set(result.name, result.name);
    }
}

const skipped = unavailable.size - failures.length;

const passed = {
    fast: '\nFast checks passed.',
    runtime: '\nRuntime checks passed.',
    full: '\nGate passed.',
};

if (interrupted) {
    // The signal handler exits once every check has stopped.
} else if (failures.length > 0) {
    for (const failure of failures) {
        const summary = summarise(failure.output);
        if (summary !== '') {
            console.error(
                `\n----- ${failure.name} (summary; whole output in ${failure.log}) -----\n${summary}`
            );
        }
        const heading = failure.timedOut
            ? `${failure.name} timed out after ${CHECK_TIMEOUT_MS / 60_000} minutes. Its output so far:\n`
            : '';
        console.error(`\n----- ${failure.name} -----\n${heading}${failure.output}`);
    }
    removeStamp(verifyDirectory);
    const skippedNote = skipped > 0 ? `, ${skipped} skipped` : '';
    console.error(`\n${failures.length} check(s) failed${skippedNote}.`);
    // Last, so the paths stay on screen: search these rather than rerun.
    for (const failure of failures) {
        console.error(`log ${failure.name}: ${failure.log}`);
    }
    // Not `process.exit(1)`: a write to a piped stderr can still be queued, and
    // exiting at once drops it. Nothing else holds the event loop open by now.
    process.exitCode = 1;
} else {
    console.log(passed[mode]);
    const endingTree = treeState(repoRoot);
    if (endingTree.tree === startingTree.tree) {
        writeStamp(verifyDirectory, mode, startingTree);
        console.log(
            `Recorded in ${stampPath(verifyDirectory)} (pnpm run verify:status).`
        );
    } else {
        console.log(
            'The tree changed while the checks ran, so no stamp was written. Run again on a settled tree to record a pass.'
        );
    }
}

/**
 * Fast mode's test command: `test:coverage` for each package the branch
 * changes, so a coverage threshold fails here rather than at the full gate, and
 * `test:run` for the rest. Prints which packages run with coverage.
 */
function testCommandForBranch() {
    const packages = listPackages();
    const changed = changedPackages(packages);
    if (changed === undefined) {
        console.log(
            'coverage: none (origin/main is missing or shares no commit with HEAD)'
        );
    } else if (changed.length === 0) {
        console.log('coverage: none (no package changed since origin/main)');
    } else {
        console.log(`coverage: ${changed.join(', ')} (changed since origin/main)`);
    }
    const covered = changed ?? [];
    const rest = packages
        .map(({ name }) => name)
        .filter((name) => !covered.includes(name));
    if (covered.length === 0) return testPackages('test:run', rest);
    if (rest.length === 0) return testPackages('test:coverage', covered);
    // Both runs happen whatever the first one's result, and either failing fails the check.
    return [
        `${testPackages('test:coverage', covered)}; coverage=$?`,
        `${testPackages('test:run', rest)}; rest=$?`,
        '[ $coverage -eq 0 ] && [ $rest -eq 0 ]',
    ].join('; ');
}

/**
 * A command running `script` in each named package, one package at a time to
 * bound memory. It carries on past a failing package, and pnpm's closing
 * summary names each one that failed.
 */
function testPackages(script, names) {
    const filters = names.map((name) => `-F "${name}"`).join(' ');
    return `pnpm -r --no-bail --workspace-concurrency=1 ${filters} ${script}`;
}

/** The workspace packages under `packages/` and `packages/plugins/`, each with its directory and name. */
function listPackages() {
    return ['packages', 'packages/plugins']
        .flatMap((parent) =>
            readdirSync(join(repoRoot, parent), { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => `${parent}/${entry.name}`)
        )
        .filter((dir) => existsSync(join(repoRoot, dir, 'package.json')))
        .map((dir) => ({
            dir,
            name: JSON.parse(readFileSync(join(repoRoot, dir, 'package.json'), 'utf8'))
                .name,
        }));
}

/**
 * The names of the packages with a file that differs from the merge base with
 * `origin/main`: committed, staged, unstaged or untracked. Undefined when there
 * is no merge base, as in a clone without `origin/main`.
 */
function changedPackages(packages) {
    const git = (...args) =>
        execFileSync('git', args, {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    let mergeBase;
    try {
        mergeBase = git('merge-base', 'origin/main', 'HEAD').trim();
    } catch {
        return undefined;
    }
    const paths = [
        ...git('diff', '--name-only', '-z', mergeBase).split('\0'),
        ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0'),
    ];
    return packages
        .filter(({ dir }) => paths.some((path) => path.startsWith(`${dir}/`)))
        .map(({ name }) => name);
}

/**
 * The lines of a failing check's output that name a failure, capped, so they
 * stay visible when a CI log view cuts the middle of the full output.
 */
function summarise(output) {
    const lines = output.split('\n').filter((line) => SUMMARY_PATTERN.test(line));
    if (lines.length <= SUMMARY_LINES) return lines.join('\n');
    return [
        ...lines.slice(0, SUMMARY_LINES),
        `(the first ${SUMMARY_LINES} of ${lines.length} matching lines)`,
    ].join('\n');
}
