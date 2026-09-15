/**
 * Runs the gate, in stages, with everything that can overlap overlapping.
 *
 * `--fast` runs only the stages that need no build: the published packages'
 * typechecks, their test suites, lint and `check:unused`. That is the loop to
 * run while working. The full run adds the build and everything downstream of it.
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
 */

import { spawn } from 'node:child_process';
import console from 'node:console';
import { constants } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { stopProcessGroup } from './process-group.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The slowest healthy check, `test:run`, takes about eight minutes on a CI
// runner, so this trips only on a hang. It sits inside the CI jobs'
// `timeout-minutes`, so the check's output is still printed.
const CHECK_TIMEOUT_MS = 15 * 60_000;

/** Longer than a boot check's own 5 s cleanup, so that cleanup can finish. */
const STOP_GRACE_MS = 10_000;

/** How long a check's output may stay open after the check itself exits. */
const PIPE_GRACE_MS = 5000;

// Lines vitest (and most tools) use to name a failure, for a failing check's
// summary.
const SUMMARY_PATTERN =
    /FAIL|✗|×|AssertionError|Error:|Test Files|Tests |ERROR: Coverage/;
const SUMMARY_LINES = 60;

const mode = process.argv.includes('--fast')
    ? 'fast'
    : process.argv.includes('--runtime')
      ? 'runtime'
      : 'full';

/** Each stage runs in parallel; stages run in order. */
const stagesByMode = {
    fast: [
        [
            ['typecheck:packages', 'pnpm -r -F "./packages/**" typecheck'],
            [
                'test:packages',
                // The assistant is left out: its suite resolves core through
                // `dist`, which this stage does not build. Every other plugin
                // resolves core to source and needs no build.
                'pnpm -F @astromech/schema-engine test:run && pnpm -F astromech test:run && pnpm -F @astromech/admin test:run && pnpm -F @astromech/forms -F @astromech/menus -F @astromech/redirects -F @astromech/backups -F @astromech/seo test:run',
            ],
            ['lint', 'pnpm run lint'],
            ['check:unused', 'pnpm run check:unused'],
        ],
    ],
    runtime: [
        // No declarations: nothing this mode runs reads a `.d.ts`.
        [['build:js', 'pnpm run build:js']],
        // routes:generate primes routeTree.gen.ts for the concurrent boot
        // builds below (see the header comment); test:run is independent of it.
        [
            ['test:run', 'pnpm run test:run'],
            ['routes:generate', 'pnpm -F @astromech/admin routes:generate'],
        ],
        [
            ['check:boot', 'pnpm run check:boot'],
            ['check:boot:cloudflare', 'pnpm run check:boot:cloudflare'],
        ],
    ],
    full: [
        [['build', 'pnpm run build']],
        [
            ['test:run', 'pnpm run test:run'],
            ['lint', 'pnpm run lint'],
            ['check:unused', 'pnpm run check:unused'],
            ['check:node-imports', 'pnpm run check:node-imports'],
            ['check:exports', 'pnpm run check:exports'],
            ['check:docs', 'pnpm run check:docs'],
        ],
        [['typecheck', 'pnpm run typecheck']],
        // Prime routeTree.gen.ts so the two boot builds below both read it
        // unchanged and neither writes it. See the header comment.
        [['routes:generate', 'pnpm -F @astromech/admin routes:generate']],
        [
            ['check:boot', 'pnpm run check:boot'],
            ['check:boot:cloudflare', 'pnpm run check:boot:cloudflare'],
        ],
    ],
};

const stages = stagesByMode[mode];

/** Checks still running, each the leader of its own process group. */
const running = new Set();

const run = (name, command) =>
    new Promise((done) => {
        const started = Date.now();
        const child = spawn(command, {
            cwd: repoRoot,
            shell: true,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        running.add(child);
        let output = '';
        child.stdout.on('data', (chunk) => (output += chunk));
        child.stderr.on('data', (chunk) => (output += chunk));

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
            running.delete(child);
            const failed = timedOut || code !== 0;
            const seconds = ((Date.now() - started) / 1000).toFixed(1);
            const note = timedOut ? ', timed out' : '';
            console.log(`${failed ? 'FAIL' : 'ok  '} ${name} (${seconds}s${note})`);
            if (heldOpen) {
                console.log(
                    `warn ${name} exited, but a process it started held its output open and was stopped`
                );
            }
            done({ name, failed, timedOut, output });
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

// Each check leads its own process group, which a Ctrl-C at the terminal does
// not reach, so the signal is passed on to every check still running.
for (const signal of ['SIGINT', 'SIGTERM']) {
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

for (const stage of stages) {
    const results = await Promise.all(stage.map(([name, command]) => run(name, command)));
    failures.push(...results.filter((result) => result.failed));
    if (failures.length > 0 || interrupted) break;
}

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
            console.error(`\n----- ${failure.name} (summary) -----\n${summary}`);
        }
        const heading = failure.timedOut
            ? `${failure.name} timed out after ${CHECK_TIMEOUT_MS / 60_000} minutes. Its output so far:\n`
            : '';
        console.error(`\n----- ${failure.name} -----\n${heading}${failure.output}`);
    }
    console.error(`\n${failures.length} check(s) failed.`);
    // Not `process.exit(1)`: a write to a piped stderr can still be queued, and
    // exiting at once drops it. Nothing else holds the event loop open by now.
    process.exitCode = 1;
} else {
    console.log(passed[mode]);
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
