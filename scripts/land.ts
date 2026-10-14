#!/usr/bin/env node
/**
 * Lands the current worktree's branch on main: a `--no-ff` merge onto the remote's main, pushed,
 * then the worktree and branch removed and CI watched. It does not run the gate: it asks
 * Turborepo's cache whether a full run would be all cache hits (`scripts/lib/gate.ts`) and refuses
 * when it would not.
 *
 *   pnpm run land [--message-file <path>] [--no-ci] [--dry-run] [--no-gate-check]
 *
 * The lead runs it from inside the worktree, once the gate (`pnpm run verify`) has passed on the
 * branch's HEAD; a sub-agent never does (`AGENTS.md`, "Branches and worktrees").
 *
 * Exit codes: 0 when the branch landed and CI passed (or was not watched), 1 when the script
 * refused, a step failed or CI failed, 2 on a usage error.
 *
 * Steps, each stopping the script when it fails:
 *  1. Refuse when the worktree has uncommitted changes.
 *  2. Fetch, and print how many commits the remote's main has that the branch does not. The
 *     branch need not contain them, unless `REQUIRE_UP_TO_DATE` is set.
 *  3. Refuse unless a full gate run on this content would be all cache hits
 *     (`pnpm run verify:status --full`). Step 1 leaves no uncommitted changes, so that content is
 *     HEAD's tree. The run is scoped to the tasks the branch affects since its merge base with
 *     main, so main's newer commits never make it miss; CI's full run on main checks the merge.
 *     With `REQUIRE_UP_TO_DATE` it is unscoped (`--all`). `--no-gate-check` skips this step, and
 *     is only for the throwaway repositories the script is tested on, which have no gate. The
 *     Bash hook (`.claude/hooks/guard-bash-commands.mjs`) refuses the flag for agents; run from a
 *     terminal, it works as written.
 *  4. Merge HEAD into the remote's main with `git merge-tree --write-tree`
 *     (`scripts/lib/merged-tree.ts`), which writes the merged tree without touching the worktree,
 *     and refuse when the merge conflicts, naming the conflicted paths.
 *  5. Make the merge commit with `git commit-tree`: its parents are the remote's main and HEAD,
 *     and its tree is step 4's, which is what a `--no-ff` merge gives. The message is "Merge
 *     branch '<branch>'" with the body from `--message-file` (the drift decisions, AGENTS.md
 *     "Workflow").
 *  6. Push the merge commit to main. Nothing needs undoing when the push fails: the merge commit
 *     is on no branch. The script fetches again to say why: main moved since the first fetch, or
 *     something else, when it prints git's error output.
 *  7. Remove the worktree with `wt remove`. Every later step runs in the main checkout.
 *  8. Delete the branch once main contains it.
 *  9. Fast-forward the main checkout when it is on main with no uncommitted changes to tracked
 *     files. Untracked files don't block it: git refuses a fast-forward that would overwrite one.
 * 10. Wait for CI on the merge commit, and print the failed jobs' logs when it fails
 *     (`scripts/lib/ci.ts`). A `gh` call that fails, as on a GitHub 502, is retried; when it keeps
 *     failing, the script says the merge is already on main, prints the `gh` command that finishes
 *     the watch, and exits 1. `--no-ci` skips this, for a repository with no CI.
 *
 * The merge is on main once step 6 succeeds, so a failure in steps 7 to 9 does not stop the
 * script: it prints the steps left to do by hand, still waits for CI, and exits 1.
 *
 * `--dry-run` runs the checks in steps 1 to 4 (the fetch updates only remote-tracking refs, and
 * the merge writes only objects) and prints the commands of the other steps without running them.
 *
 * The repository, its main checkout and the remote all come from the current directory, so the
 * script works on a throwaway repository as well as this one. The remote is the one main tracks,
 * else `origin`.
 */
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { step } from './lib/check-helpers.ts';
import { CiUnknown, watchCi } from './lib/ci.ts';
import { gateStatus } from './lib/gate.ts';
import { mergedTree } from './lib/merged-tree.ts';
import { capture, run, succeeds } from './lib/run.ts';

const USAGE =
    'usage: pnpm run land [--message-file <path>] [--no-ci] [--dry-run] [--no-gate-check]';

/**
 * Whether the branch must contain the remote's main before it lands, and the gate check runs
 * every task rather than those the branch affects. Off while no site runs Astromech; set it to
 * true after 1.0.
 */
const REQUIRE_UP_TO_DATE = false;

const MAIN = 'main';

/** Thrown to stop the script with exit code 1, after printing `message`. */
class Stop extends Error {}

const options = parseArguments();
if (options === undefined) {
    process.exitCode = 2;
} else {
    try {
        process.exitCode = await land(options);
    } catch (error) {
        if (!(error instanceof Stop)) throw error;
        console.error(`\n${error.message}`);
        process.exitCode = 1;
    }
}

type Options = { dryRun: boolean; ci: boolean; gateCheck: boolean; messageFile?: string };

/** Lands the branch, and returns the exit code. Throws `Stop` to refuse or fail. */
async function land(options: Options): Promise<number> {
    const worktree = git(['rev-parse', '--show-toplevel']);
    const mainCheckout = dirname(
        git(['rev-parse', '--path-format=absolute', '--git-common-dir'])
    );
    const branch = gitOrNull(['symbolic-ref', '--short', 'HEAD']);
    if (branch === null)
        refuse('HEAD is detached. Run this from a worktree on its branch.');
    if (worktree === mainCheckout || branch === MAIN) {
        refuse(
            `Run this from the branch's worktree, not from the main checkout or ${MAIN}.`
        );
    }
    const remote = gitOrNull(['config', '--get', `branch.${MAIN}.remote`]) ?? 'origin';
    const remoteMain = `${remote}/${MAIN}`;
    // Read before anything changes, so a wrong path stops the script at the start.
    const message = mergeMessage(branch, options.messageFile);

    step('Checking for uncommitted changes');
    const changes = git(['status', '--porcelain']);
    if (changes !== '') refuse(`${worktree} has uncommitted changes:\n${changes}`);

    step(`Fetching ${remote}`);
    await run('git', ['fetch', '--quiet', remote]);
    const behind = Number(git(['rev-list', '--count', `HEAD..${remoteMain}`]));
    if (behind > 0 && REQUIRE_UP_TO_DATE) {
        refuse(
            `${branch} does not contain ${remoteMain}: rebase onto ${remoteMain} and rerun the gate.`
        );
    }
    console.log(
        behind === 0
            ? `${branch} contains ${remoteMain}.`
            : `${remoteMain} has ${behind} commit${behind === 1 ? '' : 's'} that ${branch} does not; the merge keeps them.`
    );

    if (options.gateCheck) {
        step('Checking the full gate passed on this content');
        const gate = gateStatus(worktree, 'full', { all: REQUIRE_UP_TO_DATE });
        if (!gate.matches) {
            refuse(`run \`pnpm run verify\` in this worktree first: ${gate.message}.`);
        }
        console.log(gate.message);
    } else {
        console.log('Skipping the gate check (--no-gate-check).');
    }

    const base = git(['rev-parse', '--verify', `${remoteMain}^{commit}`]);
    const tip = git(['rev-parse', '--verify', 'HEAD^{commit}']);
    const head = git(['log', '-1', '--format=%h %s', tip]);
    console.log(`Landing ${branch} at ${head}.`);

    step(`Merging ${branch} into ${remoteMain}`);
    const merge = mergedTree(worktree, base, tip);
    if (merge.tree === undefined) {
        refuse(
            `${branch} conflicts with ${remoteMain} in:\n${merge.conflicts.map((path) => `  ${path}`).join('\n')}\nRebase onto ${remoteMain}, resolve them, and rerun the gate.`
        );
    }
    console.log(`Merged tree ${merge.tree.slice(0, 12)}.`);

    step(`Making the merge commit of ${branch} onto ${remoteMain}`);
    const landed = mergeCommit(merge.tree, base, tip, message, options.dryRun);
    console.log(`Made ${landed}.`);

    step(`Pushing to ${remoteMain}`);
    pushMergeCommit({ landed, remote, remoteMain, base, dryRun: options.dryRun });

    // The worktree directory is about to go, and a command can't start in a deleted directory.
    process.chdir(mainCheckout);
    const change = (command: string, args: string[]): Promise<void> => {
        if (options.dryRun) {
            console.log(`  $ ${command} ${args.join(' ')}`);
            return Promise.resolve();
        }
        return run(command, args);
    };
    // Each step with the command that finishes it by hand when it, or a step before it, fails.
    const cleanupSteps = [
        {
            name: 'removing the worktree',
            run: () => {
                step(`Removing the worktree ${worktree}`);
                // The branch is kept here and deleted in the next step, only once main is known
                // to contain it.
                return change('wt', [
                    '-C',
                    mainCheckout,
                    'remove',
                    branch,
                    '--no-delete-branch',
                    '--foreground',
                    '--yes',
                ]);
            },
            byHand: `wt -C ${mainCheckout} remove ${branch} --no-delete-branch --foreground --yes`,
        },
        {
            name: 'deleting the branch',
            run: async () => {
                step(`Deleting the branch ${branch}`);
                if (
                    options.dryRun ||
                    gitSucceeds([
                        '-C',
                        mainCheckout,
                        'merge-base',
                        '--is-ancestor',
                        branch,
                        remoteMain,
                    ])
                ) {
                    await change('git', [
                        '-C',
                        mainCheckout,
                        'branch',
                        '--quiet',
                        '-D',
                        branch,
                    ]);
                } else {
                    console.log(`Kept ${branch}: ${remoteMain} does not contain it.`);
                }
            },
            byHand: `git -C ${mainCheckout} branch -D ${branch}`,
        },
        {
            name: 'fast-forwarding the main checkout',
            run: async () => {
                step(`Fast-forwarding the main checkout ${mainCheckout}`);
                const mainBranch = gitOrNull([
                    '-C',
                    mainCheckout,
                    'symbolic-ref',
                    '--short',
                    'HEAD',
                ]);
                const mainChanges = git([
                    '-C',
                    mainCheckout,
                    'status',
                    '--porcelain',
                    '--untracked-files=no',
                ]);
                if (mainBranch !== MAIN) {
                    console.log(
                        `Left it: it is on ${mainBranch ?? 'a detached HEAD'}, not ${MAIN}.`
                    );
                } else if (mainChanges !== '') {
                    console.log(`Left it: it has uncommitted changes:\n${mainChanges}`);
                } else {
                    await change('git', [
                        '-C',
                        mainCheckout,
                        'merge',
                        '--quiet',
                        '--ff-only',
                        remoteMain,
                    ]);
                }
            },
            byHand: `git -C ${mainCheckout} merge --ff-only ${remoteMain}`,
        },
    ];
    let cleanupFailed = false;
    for (const [index, cleanupStep] of cleanupSteps.entries()) {
        try {
            await cleanupStep.run();
        } catch (error) {
            cleanupFailed = true;
            console.error(
                `\nLanded ${landed} on ${MAIN}; cleanup failed at ${cleanupStep.name}: ${(error as Error).message}`
            );
            console.error('Fix the cause, then finish by hand:');
            for (const { byHand } of cleanupSteps.slice(index))
                console.error(`  ${byHand}`);
            break;
        }
    }

    if (!cleanupFailed) console.log(`\nLanded ${branch} as ${landed}.`);

    if (options.ci) {
        step(`Waiting for CI on ${landed}`);
        if (!options.dryRun) await waitForCi(landed, mainCheckout);
        else
            console.log(
                `  $ gh run list --commit ${landed}, then gh run watch --exit-status <id>`
            );
    }
    return cleanupFailed ? 1 : 0;
}

/**
 * Pushes the merge commit to main. When the push fails it fetches again to say why, and stops:
 * either way the merge commit is on no branch, so nothing needs undoing.
 */
function pushMergeCommit({
    landed,
    remote,
    remoteMain,
    base,
    dryRun,
}: {
    landed: string;
    remote: string;
    remoteMain: string;
    base: string;
    dryRun: boolean;
}): void {
    const args = ['push', '--quiet', remote, `${landed}:${MAIN}`];
    if (dryRun) {
        console.log(`  $ git ${args.join(' ')}`);
        return;
    }
    // git's error output is held back until the script knows whether main moved.
    const result = spawnSync('git', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'inherit', 'pipe'],
    });
    if (result.status === 0) {
        process.stderr.write(result.stderr);
        return;
    }
    const fetched = gitSucceeds(['fetch', '--quiet', remote]);
    if (fetched && gitOrNull(['rev-parse', '--verify', remoteMain]) !== base) {
        refuse(`${MAIN} moved since the fetch: run \`pnpm run land\` again.`);
    }
    process.stderr.write(result.stderr || (result.error?.message ?? ''));
    refuse(
        fetched
            ? `the push to ${remoteMain} failed, though ${MAIN} has not moved. See git's output above.`
            : `the push to ${remoteMain} failed, and fetching ${remote} to see whether ${MAIN} moved failed too. See git's output above.`
    );
}

/**
 * Writes the merge commit with `tree`, the merged tree, and returns its hash. Under `--dry-run` it
 * prints the command instead. The commit is on no branch until the push, so it changes nothing a
 * reader can see.
 */
function mergeCommit(
    tree: string,
    base: string,
    tip: string,
    message: string,
    dryRun: boolean
): string {
    const directory = mkdtempSync(join(tmpdir(), 'land-'));
    const messageFile = join(directory, 'message');
    const args = ['commit-tree', tree, '-p', base, '-p', tip, '-F', messageFile];
    try {
        writeFileSync(messageFile, message);
        if (dryRun) {
            console.log(`  $ git ${args.join(' ')}`);
            return '<merge commit>';
        }
        return git(args);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

/** The merge commit's message: git's own subject for the merge, then the body file if given. */
function mergeMessage(branch: string, messageFile: string | undefined): string {
    const subject = `Merge branch '${branch}'`;
    if (messageFile === undefined) return `${subject}\n`;
    // `pnpm run` starts scripts in the package root; INIT_CWD is where the command was typed.
    const path = resolve(process.env.INIT_CWD ?? process.cwd(), messageFile);
    const body = readFileSync(path, 'utf8').trim();
    return body === '' ? `${subject}\n` : `${subject}\n\n${body}\n`;
}

/**
 * Watches CI on `sha` to its end (`scripts/lib/ci.ts`), and stops the script when CI failed or
 * `gh` could not say how it went. Either way the merge is already on main.
 */
async function waitForCi(sha: string, mainCheckout: string): Promise<void> {
    let passed: boolean;
    try {
        passed = await watchCi(sha, {
            capture: (args) => capture('gh', args, { cwd: mainCheckout }),
            run: (args) => run('gh', args, { cwd: mainCheckout }),
        });
    } catch (error) {
        if (!(error instanceof CiUnknown)) throw error;
        fail(
            `Could not tell how CI went on ${sha}: ${error.message}
The merge is already on ${MAIN}. Finish the watch by hand:
  ${error.byHand}`
        );
    }
    if (!passed) fail(`CI did not pass on ${sha}. The merge is already on ${MAIN}.`);
    console.log('CI passed.');
}

function git(args: string[]): string {
    return capture('git', args);
}

function gitOrNull(args: string[]): string | null {
    try {
        return capture('git', args, { stderr: 'ignore' }) || null;
    } catch {
        return null;
    }
}

function gitSucceeds(args: string[]): boolean {
    return succeeds('git', args);
}

/**
 * The flags, or undefined after printing the usage. pnpm passes a `--` on to the script
 * (`pnpm run land -- --no-ci`), and this takes no positional arguments, so every `--` is dropped.
 */
function parseArguments(): Options | undefined {
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    try {
        const { values } = parseArgs({
            args,
            strict: true,
            options: {
                'message-file': { type: 'string' },
                'no-ci': { type: 'boolean' },
                'dry-run': { type: 'boolean' },
                'no-gate-check': { type: 'boolean' },
            },
        });
        return {
            dryRun: values['dry-run'] === true,
            ci: values['no-ci'] !== true,
            gateCheck: values['no-gate-check'] !== true,
            ...(values['message-file'] === undefined
                ? {}
                : { messageFile: values['message-file'] }),
        };
    } catch (error) {
        console.error(`${(error as Error).message}\n${USAGE}`);
        return undefined;
    }
}

/** Stops before anything has changed, or after the change was undone. */
function refuse(message: string): never {
    throw new Stop(`Refused: ${message}`);
}

function fail(message: string): never {
    throw new Stop(message);
}
