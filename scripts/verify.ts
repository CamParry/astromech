/**
 * Runs the gate: one `turbo run` over the tasks in `turbo.json`. With
 * `--status`, says instead whether the gate has already passed on this content.
 *
 *     pnpm run verify [--fast | --runtime | --full] [--all]
 *     pnpm run verify:status [--fast | --runtime | --full] [--all]
 *
 * Run by a developer or an agent before handing work back, by CI (`--all`, on
 * each Node version), and by `pnpm run land`, which asks for `--status --full`
 * through `lib/gate.ts`. `pnpm run verify:status` is `verify --status`.
 *
 * Exit codes: 0 when the gate passed (with `--status`: when a mode asked
 * about would be all cache hits), 1 when a task failed or would run, 2 on a
 * usage error.
 *
 * `--fast` runs the tasks that need no build: the published packages' and the
 * scripts package's typechecks, test suites and lint, `check:unused`,
 * `check:hooks` and `format:check`. The full run, the default, adds the builds
 * and everything that reads them.
 * `--runtime` runs only the checks whose result can vary with the Node version:
 * the test suites and the two boot checks, over builds without declarations.
 * CI runs the full gate on one Node version and this subset on the other.
 * `scripts/lib/gate.ts` lists each mode's tasks.
 *
 * Only the tasks a change affects run. Turborepo compares each task's `inputs`
 * with the merge base with `origin/main`, uncommitted and untracked files
 * included, and selects the tasks whose inputs changed and the tasks that
 * depend on them. A selected task whose inputs and dependencies match an
 * earlier run is a cache hit: its logs and outputs are restored, not rerun.
 * `--all` drops the scope, as CI does. Before running, the gate prints the
 * scope, a `run` or `cached` line for each task, and how many tasks the scope
 * left out.
 *
 * A failed task does not stop the gate (`--continue=dependencies-successful`).
 * A task that reads a failed task's output is skipped, with a
 * `skip <task> (needs <failed>)` line, and every other task still runs. After
 * the run, each task gets an `ok`, `FAIL` or `skip` line, and the summary at
 * the end prints the lines of each failure's log that name what failed.
 *
 * `turbo.json` holds the order: anything reading `dist` waits for the build
 * that writes it, and the two boot checks wait for `routes:generate`. `tsr
 * generate` writes `packages/admin/src/routeTree.gen.ts`, and so does the
 * TanStack Router Vite plugin inside each app build. The generator reads the
 * existing file and skips the write when the content is unchanged, so once
 * `routes:generate` has made it current, both app builds read it and neither
 * writes, and the race is gone.
 *
 * Run locally on macOS, the gate leaves the machine usable: it runs at a lower
 * priority, the tests run fewer workers, and Turborepo runs fewer tasks at
 * once (`scripts/lib/cpu-limits.ts`). CI runs at full speed, and so does a
 * local run with `ASTROMECH_FULL_SPEED=1` set.
 *
 * Every mode first takes the lock in `scripts/lib/run-lock.ts`, so a second
 * gate, build, test run or boot check started meanwhile, in any worktree,
 * waits for this one to finish rather than run beside it. The tasks this
 * starts go ahead under its lock, and the lock file lists Turborepo's process
 * group, so a gate killed outright still holds the lock until Turborepo ends.
 * The whole run has one deadline, inside the CI jobs' `timeout-minutes`.
 *
 * Each task's whole output goes to a log file in the worktree's git directory,
 * `verify/<task>.log`, and a `FAIL` line names its path. To see more of a
 * failure, search that log; don't rerun the task.
 *
 * Turborepo's cache is the record of what passed. `--status` asks it, with a
 * dry run, whether a run of each mode would be all cache hits, before or after
 * the content is committed, and prints a `match` or `no match` line for each.
 * It runs no check and does not wait for the run lock, so it costs a second
 * or two rather than a gate. With no mode flag it asks about every mode and
 * exits 0 when any matches.
 */
import type { Mode, Scope } from './lib/gate.ts';
import { spawn } from 'node:child_process';
import console from 'node:console';
import {
    copyFileSync,
    createWriteStream,
    existsSync,
    readFileSync,
    rmSync,
} from 'node:fs';
import { constants } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { environmentWithoutNodeEnv } from './lib/check-helpers.ts';
import { relaunchAtLowerPriority } from './lib/cpu-limits.ts';
import {
    dryRun,
    gateConcurrency,
    gateScope,
    gateStatus,
    logPath,
    MODES,
    prepareVerifyDirectory,
    skippedTasks,
    turboBinary,
    turboEnvironment,
    turboRunArguments,
} from './lib/gate.ts';
import { stopProcessGroup } from './lib/process-group.ts';
import { recordProcessGroups, waitForRunLock } from './lib/run-lock.ts';

const USAGE = `usage: pnpm run verify [--fast | --runtime | --full] [--all]
       pnpm run verify --status [--fast | --runtime | --full] [--all]`;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// A cold full run takes about ten minutes on a CI runner, so this trips only
// on a hang. It sits inside the CI jobs' `timeout-minutes` (30 and 35), so the
// output so far is still printed.
const RUN_TIMEOUT_MS = 25 * 60_000;

/** Long enough for Turborepo to stop its tasks and a boot check's own 5 s cleanup. */
const STOP_GRACE_MS = 30_000;

// Lines vitest (and most tools) use to name a failure, for a failing task's
// summary. `[warn]` is Prettier's line naming each unformatted file, and
// `<line>:<column>  error` is ESLint's for each problem.
const SUMMARY_PATTERN =
    /FAIL|✗|✖|×|AssertionError|Error:|error TS|Test Files|Tests |ERROR: Coverage|\[ERROR\]|^\[warn\]|^\s+\d+:\d+\s+error\s|ELIFECYCLE/;
const SUMMARY_LINES = 60;

const PASSED: Record<Mode, string> = {
    fast: 'Fast checks passed.',
    runtime: 'Runtime checks passed.',
    full: 'Gate passed.',
};

/** A task in Turborepo's run summary that ran or was restored. */
type ExecutedTask = {
    taskId: string;
    cache: { status: 'HIT' | 'MISS' };
    execution: { startTime: number; endTime: number; exitCode: number };
};

type TurboOutcome = {
    code: number | null;
    output: string;
    timedOut: boolean;
    interrupted: boolean;
};

const options = parseArguments();
if (options === undefined) {
    process.exitCode = 2;
} else if (options.status) {
    process.exitCode = status(options.modes, options.all);
} else {
    process.exitCode = await gate(options.modes[0] ?? 'full', options.all);
}

/**
 * The flags, or undefined after printing the usage. pnpm passes a `--` on to
 * the script (`pnpm run verify:status -- --fast` runs `verify.ts --status --
 * --fast`), and this takes no positional arguments, so every `--` is dropped.
 */
function parseArguments(): { modes: Mode[]; all: boolean; status: boolean } | undefined {
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    let values;
    try {
        ({ values } = parseArgs({
            args,
            strict: true,
            options: {
                fast: { type: 'boolean' },
                runtime: { type: 'boolean' },
                full: { type: 'boolean' },
                all: { type: 'boolean' },
                status: { type: 'boolean' },
            },
        }));
    } catch (error) {
        console.error(`${(error as Error).message}\n${USAGE}`);
        return undefined;
    }
    const modes = MODES.filter((mode) => values[mode] === true);
    const status = values.status === true;
    if (!status && modes.length > 1) {
        console.error(`verify runs one mode at a time: ${modes.join(', ')}\n${USAGE}`);
        return undefined;
    }
    return { modes, all: values.all === true, status };
}

/** Prints whether each mode asked about would be all cache hits; 0 when any would. */
function status(asked: Mode[], all: boolean): number {
    let matched = false;
    for (const mode of asked.length > 0 ? asked : MODES) {
        const { matches, message } = gateStatus(repoRoot, mode, { all });
        matched ||= matches;
        console.log(`${matches ? 'match' : 'no match'} (${mode}): ${message}`);
    }
    return matched ? 0 : 1;
}

/** Runs the gate in `mode`, and returns its exit code. */
async function gate(mode: Mode, all: boolean): Promise<number> {
    // First, before anything prints: every task inherits the priority.
    relaunchAtLowerPriority();

    // Before any task starts, and before the environment below is copied, since
    // the lock sets the variable that lets the tasks skip it.
    await waitForRunLock('verify');

    const verifyDirectory = prepareVerifyDirectory(repoRoot);
    const scope = gateScope(repoRoot, { all });
    const environment = turboEnvironment(
        repoRoot,
        mode,
        scope,
        environmentWithoutNodeEnv('verify')
    );

    console.log(scope.line);
    const plan = dryRun(repoRoot, mode, scope);
    for (const task of plan) {
        console.log(`${task.status === 'HIT' ? 'cached' : 'run   '} ${task.taskId}`);
    }
    if (scope.affected) {
        const leftOut = dryRun(repoRoot, mode).length - plan.length;
        console.log(
            `left out: ${leftOut} task(s) that no change since ${scope.base} affects`
        );
    }

    if (plan.length === 0) {
        console.log(`\nNothing to check. ${PASSED[mode]}`);
        return 0;
    }

    const turboLog = join(verifyDirectory, 'turbo.log');
    const started = Date.now();
    const outcome = await runTurbo(mode, scope, environment, turboLog);
    const summary = readSummary(outcome.output);

    /** Each executed task, by id, with its exit code, time and cache status. */
    const executed = new Map(
        (summary?.tasks ?? [])
            .filter((task) => task.execution !== undefined)
            .map((task) => [task.taskId, task])
    );
    const failed = new Set(
        [...executed.values()]
            .filter((task) => task.execution.exitCode !== 0)
            .map((task) => task.taskId)
    );

    console.log('');
    for (const task of plan) {
        const result = executed.get(task.taskId);
        if (result === undefined) continue;
        const log = logPath(verifyDirectory, task.taskId);
        const source = join(repoRoot, task.logFile);
        if (existsSync(source)) copyFileSync(source, log);
        const seconds = (
            (result.execution.endTime - result.execution.startTime) /
            1000
        ).toFixed(1);
        if (failed.has(task.taskId)) {
            console.log(`FAIL ${task.taskId} (${seconds}s) log: ${log}`);
        } else {
            const cached = result.cache.status === 'HIT' ? ', cached' : '';
            console.log(`ok   ${task.taskId} (${seconds}s${cached})`);
        }
    }
    const skipped = skippedTasks(plan, new Set(executed.keys()), failed);
    for (const { taskId, needs } of skipped) {
        console.log(
            `skip ${taskId} (${needs === undefined ? 'not run' : `needs ${needs}`})`
        );
    }

    const minutes = ((Date.now() - started) / 60_000).toFixed(1);

    // The signal handler exits once Turborepo has stopped.
    if (outcome.interrupted) return 1;
    if (outcome.code === 0 && failed.size === 0 && skipped.length === 0) {
        console.log(`\n${PASSED[mode]} (${minutes} min)`);
        return 0;
    }
    for (const taskId of failed) {
        const log = logPath(verifyDirectory, taskId);
        const lines = existsSync(log) ? summarise(readFileSync(log, 'utf8')) : '';
        if (lines !== '') {
            console.error(
                `\n----- ${taskId} (summary; whole output in ${log}) -----\n${lines}`
            );
        }
    }
    if (outcome.timedOut) {
        console.error(
            `\nThe run timed out after ${RUN_TIMEOUT_MS / 60_000} minutes; Turborepo was stopped.`
        );
    }
    if (summary === undefined) {
        console.error(`\nTurborepo wrote no run summary; its output is in ${turboLog}.`);
    } else if (failed.size === 0 && outcome.code !== 0) {
        console.error(
            `\nTurborepo exited with ${outcome.code}; its output is in ${turboLog}.`
        );
    }
    const skippedNote = skipped.length > 0 ? `, ${skipped.length} skipped` : '';
    console.error(`\n${failed.size} task(s) failed${skippedNote}.`);
    // Last, so the paths stay on screen: search these rather than rerun.
    for (const taskId of failed) {
        console.error(`log ${taskId}: ${logPath(verifyDirectory, taskId)}`);
    }
    // An exit code rather than `process.exit(1)`: a write to a piped stderr can
    // still be queued, and exiting at once drops it.
    return 1;
}

/**
 * Runs the mode's tasks in Turborepo, in a process group of its own so the
 * deadline and a signal stop every task with it. Its output goes to the
 * terminal and to `turboLog`. Resolves with its exit code and output.
 */
function runTurbo(
    mode: Mode,
    scope: Scope,
    environment: NodeJS.ProcessEnv,
    turboLog: string
): Promise<TurboOutcome> {
    return new Promise((done) => {
        const child = spawn(
            turboBinary(repoRoot),
            [
                ...turboRunArguments(repoRoot, mode, scope),
                '--continue=dependencies-successful',
                `--concurrency=${gateConcurrency()}`,
                // A failing task's output, whole and in one block, as it fails.
                '--output-logs=errors-only',
                '--log-order=grouped',
                // The run summary in `.turbo/runs/`, read below for each task's result.
                '--summarize',
            ],
            {
                cwd: repoRoot,
                env: environment,
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'],
            }
        );
        recordProcessGroups(child.pid === undefined ? [] : [child.pid]);
        const logStream = createWriteStream(turboLog);
        let output = '';
        const record =
            (stream: NodeJS.WriteStream) =>
            (chunk: Buffer): void => {
                output += chunk.toString();
                logStream.write(chunk);
                stream.write(chunk);
            };
        child.stdout.on('data', record(process.stdout));
        child.stderr.on('data', record(process.stderr));

        let timedOut = false;
        let interrupted = false;
        let stopping: Promise<void> | undefined;
        const deadline = setTimeout(() => {
            timedOut = true;
            stopping = stopProcessGroup(child, STOP_GRACE_MS);
        }, RUN_TIMEOUT_MS);

        // Turborepo leads its own process group, which a Ctrl-C at the
        // terminal or a closed terminal does not reach, so the signal is passed
        // on, and Turborepo stops its tasks.
        for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
            process.once(signal, () => {
                interrupted = true;
                console.error(`\n${signal}: stopping Turborepo and its tasks`);
                void stopProcessGroup(child, STOP_GRACE_MS).finally(() =>
                    process.exit(128 + constants.signals[signal])
                );
            });
        }

        child.on('close', async (code) => {
            clearTimeout(deadline);
            await stopping;
            await new Promise((fulfil) => logStream.end(fulfil));
            recordProcessGroups([]);
            done({ code, output, timedOut, interrupted });
        });
    });
}

/**
 * The run summary Turborepo printed the path of, removed once read so
 * `.turbo/runs/` does not grow. Undefined when there is none, as after a run
 * stopped early.
 */
function readSummary(output: string): { tasks: ExecutedTask[] } | undefined {
    // eslint-disable-next-line no-control-regex -- the escape that starts a colour code
    const plain = output.replaceAll(/\u001b\[[0-9;]*m/g, '');
    const named = /Summary:\s+(\S+\.json)/.exec(plain)?.[1];
    if (named === undefined) return undefined;
    const path = resolve(repoRoot, named);
    if (!path.startsWith(join(repoRoot, '.turbo', 'runs'))) return undefined;
    try {
        return JSON.parse(readFileSync(path, 'utf8')) as { tasks: ExecutedTask[] };
    } catch {
        return undefined;
    } finally {
        rmSync(path, { force: true });
    }
}

/**
 * The lines of a failing task's output that name a failure, capped, so they
 * stay visible when a CI log view cuts the middle of the full output.
 */
function summarise(output: string): string {
    const lines = output.split('\n').filter((line) => SUMMARY_PATTERN.test(line));
    if (lines.length <= SUMMARY_LINES) return lines.join('\n');
    return [
        ...lines.slice(0, SUMMARY_LINES),
        `(the first ${SUMMARY_LINES} of ${lines.length} matching lines)`,
    ].join('\n');
}
