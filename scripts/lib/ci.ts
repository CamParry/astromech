/**
 * Watches the GitHub Actions runs on a commit to their end, through the `gh`
 * CLI. `scripts/land.ts` calls it once the merge is pushed.
 *
 * GitHub's API fails now and then (a 502 on 2026-10-13), so each `gh` call is
 * tried `retries` times, `retryDelayMs` apart. `gh run watch --exit-status`
 * exits non-zero both when the run fails and when the API does, so after it
 * does, the run's status tells the two apart: a run not yet completed is
 * watched again. When `gh` keeps failing, `watchCi` throws `CiUnknown`, which
 * names the command that finishes the watch by hand.
 */
import console from 'node:console';
import { sleep } from './check-helpers.ts';

/** The two ways `watchCi` calls `gh`, passed in so a test can stand in for it. */
export type Gh = {
    /** Runs `gh` and returns its standard output. Throws when it exits non-zero. */
    capture: (args: string[]) => string;
    /** Runs `gh` with its output on the terminal. Rejects when it exits non-zero. */
    run: (args: string[]) => Promise<void>;
};

export type WatchCiOptions = {
    /** How many times to look for the commit's runs before giving up. */
    appearAttempts: number;
    appearIntervalMs: number;
    /** How many times to try each `gh` call, and how long to wait between tries. */
    retries: number;
    retryDelayMs: number;
    /** How many lines of a failed run's log to print. */
    failedLogLines: number;
};

const DEFAULTS: WatchCiOptions = {
    appearAttempts: 60,
    appearIntervalMs: 5_000,
    retries: 4,
    retryDelayMs: 5_000,
    failedLogLines: 120,
};

/** Thrown when `gh` cannot say how CI went. `byHand` is the command that finishes the watch. */
export class CiUnknown extends Error {
    readonly byHand: string;
    constructor(message: string, byHand: string) {
        super(message);
        this.byHand = byHand;
    }
}

/**
 * Waits for the CI runs on `sha`, then watches each to the end, and says
 * whether every run passed. A run asked for by id before it exists is a 404,
 * so this first polls the list until the commit has a run. A failed run's log
 * is printed; a cancelled run counts as not passed.
 */
export async function watchCi(
    sha: string,
    gh: Gh,
    options: Partial<WatchCiOptions> = {}
): Promise<boolean> {
    const settings = { ...DEFAULTS, ...options };
    const { appearAttempts, appearIntervalMs, failedLogLines } = settings;

    /** `gh.capture`, tried `retries` times; throws `CiUnknown` naming `byHand` after the last. */
    const capture = async (args: string[], byHand: string): Promise<string> => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= settings.retries; attempt += 1) {
            try {
                return gh.capture(args);
            } catch (error) {
                lastError = error;
                console.log(
                    `gh ${args.join(' ')} failed (try ${attempt} of ${settings.retries}): ${message(error)}`
                );
                if (attempt < settings.retries) await sleep(settings.retryDelayMs);
            }
        }
        throw new CiUnknown(
            `gh ${args.join(' ')} kept failing: ${message(lastError)}`,
            byHand
        );
    };

    const listCommand = `gh run list --commit ${sha}`;
    let runs: { databaseId: number; name: string }[] = [];
    for (let attempt = 0; attempt < appearAttempts && runs.length === 0; attempt += 1) {
        if (attempt > 0) await sleep(appearIntervalMs);
        runs = JSON.parse(
            await capture(
                ['run', 'list', '--commit', sha, '--json', 'databaseId,name'],
                listCommand
            )
        ) as typeof runs;
    }
    if (runs.length === 0) {
        throw new CiUnknown(`No CI run appeared for ${sha}.`, listCommand);
    }

    let passed = true;
    for (const { databaseId, name } of runs) {
        const id = String(databaseId);
        const watchCommand = `gh run watch --exit-status ${id}`;
        console.log(`Watching "${name}" (run ${id})`);
        let conclusion: string | undefined;
        for (let attempt = 1; conclusion === undefined; attempt += 1) {
            try {
                await gh.run(['run', 'watch', '--exit-status', id]);
                conclusion = 'success';
            } catch (error) {
                const run = JSON.parse(
                    await capture(
                        ['run', 'view', id, '--json', 'status,conclusion'],
                        watchCommand
                    )
                ) as { status: string; conclusion: string };
                if (run.status === 'completed') {
                    conclusion = run.conclusion;
                } else if (attempt >= settings.retries) {
                    throw new CiUnknown(
                        `gh run watch kept failing while run ${id} was ${run.status}: ${message(error)}`,
                        watchCommand
                    );
                } else {
                    console.log(
                        `gh run watch stopped while run ${id} was ${run.status} (try ${attempt} of ${settings.retries}); watching again`
                    );
                    await sleep(settings.retryDelayMs);
                }
            }
        }
        if (conclusion === 'success') continue;
        passed = false;
        if (conclusion === 'cancelled') {
            console.log(`Run ${id} was cancelled, usually by a newer push.`);
            continue;
        }
        // A job that failed before any step ran (no runner, say) has no step log, so the
        // run's summary, which names the job and the reason, stands in for it.
        const log =
            (await capture(['run', 'view', id, '--log-failed'], watchCommand)) ||
            (await capture(['run', 'view', id], watchCommand));
        console.log(`\nThe last ${failedLogLines} lines of what failed:`);
        console.log(log.split('\n').slice(-failedLogLines).join('\n'));
    }
    return passed;
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
