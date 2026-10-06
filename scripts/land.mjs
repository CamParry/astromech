#!/usr/bin/env node
/**
 * Lands the current worktree's branch on main: a `--no-ff` merge onto the remote's main, pushed,
 * then the worktree and branch removed and CI watched. Run it from inside the worktree, after
 * the gate (`pnpm run verify`) has passed on the branch's HEAD: it does not run the gate.
 *
 *   pnpm run land [--message-file <path>] [--no-ci] [--dry-run]
 *
 * Steps, each stopping the script when it fails:
 *  1. Refuse when the worktree has uncommitted changes.
 *  2. Fetch, and refuse unless the branch contains the remote's main.
 *  3. Make the merge commit with `git commit-tree`, without touching the worktree: its parents are
 *     the remote's main and HEAD, and its tree is HEAD's, which is exactly what a `--no-ff` merge
 *     gives once step 2 holds. The message is "Merge branch '<branch>'" with the body from
 *     `--message-file` (the drift decisions, AGENTS.md "Workflow").
 *  4. Push the merge commit to main. When main has moved since the fetch the push is refused, and
 *     nothing needs undoing: the merge commit is on no branch.
 *  5. Remove the worktree with `wt remove`. Every later step runs in the main checkout.
 *  6. Delete the branch once main contains it.
 *  7. Fast-forward the main checkout when it is on main with no uncommitted changes to tracked
 *     files. Untracked files don't block it: git refuses a fast-forward that would overwrite one.
 *  8. Wait for CI on the merge commit, and print the failed jobs' logs when it fails.
 *     `--no-ci` skips this, for a repository with no CI.
 *
 * `--dry-run` runs the checks in steps 1 and 2 (the fetch updates only remote-tracking refs) and
 * prints the commands of the other steps without running them.
 *
 * The repository, its main checkout and the remote all come from the current directory, so the
 * script works on a throwaway repository as well as this one. The remote is the one main tracks,
 * else `origin`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { run, sleep, step } from './check-helpers.mjs';

const MAIN = 'main';
/** How long to wait for the CI run on a pushed commit to appear before giving up. */
const CI_APPEAR_ATTEMPTS = 60;
const CI_APPEAR_INTERVAL_MS = 5_000;
/** How many lines of a failed run's log to print. */
const FAILED_LOG_LINES = 120;

const options = parseArguments(process.argv.slice(2));

const worktree = git(['rev-parse', '--show-toplevel']);
const mainCheckout = dirname(
    git(['rev-parse', '--path-format=absolute', '--git-common-dir'])
);
const branch = gitOrNull(['symbolic-ref', '--short', 'HEAD']);
if (branch === null) refuse('HEAD is detached. Run this from a worktree on its branch.');
if (worktree === mainCheckout || branch === MAIN) {
    refuse(`Run this from the branch's worktree, not from the main checkout or ${MAIN}.`);
}
const remote = gitOrNull(['config', '--get', `branch.${MAIN}.remote`]) ?? 'origin';
const remoteMain = `${remote}/${MAIN}`;
// Read before anything changes, so a wrong path stops the script at the start.
const message = mergeMessage();

step('Checking for uncommitted changes');
const changes = git(['status', '--porcelain']);
if (changes !== '') refuse(`${worktree} has uncommitted changes:\n${changes}`);

step(`Fetching ${remote}`);
await run('git', ['fetch', '--quiet', remote]);
if (!gitSucceeds(['merge-base', '--is-ancestor', remoteMain, 'HEAD'])) {
    refuse(
        `${branch} does not contain ${remoteMain}: rebase onto ${remoteMain} and rerun the gate.`
    );
}

const base = git(['rev-parse', '--verify', `${remoteMain}^{commit}`]);
const tip = git(['rev-parse', '--verify', 'HEAD^{commit}']);
const head = git(['log', '-1', '--format=%h %s', tip]);
console.log(
    `Landing ${branch} at ${head}. The gate is not run here: it must have passed on this commit.`
);

step(`Making the merge commit of ${branch} onto ${remoteMain}`);
const landed = mergeCommit();
console.log(`Made ${landed}.`);

step(`Pushing to ${remoteMain}`);
try {
    await change('git', ['push', '--quiet', remote, `${landed}:${MAIN}`]);
} catch {
    refuse(`${MAIN} moved: fetch, rebase, rerun the gate if code changed.`);
}

step(`Removing the worktree ${worktree}`);
// The worktree directory is about to go, and a command can't start in a deleted directory.
process.chdir(mainCheckout);
// The branch is kept here and deleted below, only once main is known to contain it.
await change('wt', [
    '-C',
    mainCheckout,
    'remove',
    branch,
    '--no-delete-branch',
    '--foreground',
    '--yes',
]);

step(`Deleting the branch ${branch}`);
if (
    options.dryRun ||
    gitSucceeds(['-C', mainCheckout, 'merge-base', '--is-ancestor', branch, remoteMain])
) {
    await change('git', ['-C', mainCheckout, 'branch', '--quiet', '-D', branch]);
} else {
    console.log(`Kept ${branch}: ${remoteMain} does not contain it.`);
}

step(`Fast-forwarding the main checkout ${mainCheckout}`);
const mainBranch = gitOrNull(['-C', mainCheckout, 'symbolic-ref', '--short', 'HEAD']);
const mainChanges = git([
    '-C',
    mainCheckout,
    'status',
    '--porcelain',
    '--untracked-files=no',
]);
if (mainBranch !== MAIN) {
    console.log(`Left it: it is on ${mainBranch ?? 'a detached HEAD'}, not ${MAIN}.`);
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

console.log(`\nLanded ${branch} as ${landed}.`);

if (options.ci) {
    step(`Waiting for CI on ${landed}`);
    if (!options.dryRun) await watchCi(landed);
    else
        console.log(
            `  $ gh run list --commit ${landed}, then gh run watch --exit-status <id>`
        );
}

/**
 * Writes the merge commit and returns its hash. Under `--dry-run` it prints the command instead.
 * The commit is on no branch until the push, so it changes nothing a reader can see.
 */
function mergeCommit() {
    const directory = mkdtempSync(join(tmpdir(), 'land-'));
    const messageFile = join(directory, 'message');
    const args = [
        'commit-tree',
        `${tip}^{tree}`,
        '-p',
        base,
        '-p',
        tip,
        '-F',
        messageFile,
    ];
    try {
        writeFileSync(messageFile, message);
        if (options.dryRun) {
            console.log(`  $ git ${args.join(' ')}`);
            return '<merge commit>';
        }
        return git(args);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

/** The merge commit's message: git's own subject for the merge, then the body file if given. */
function mergeMessage() {
    const subject = `Merge branch '${branch}'`;
    if (options.messageFile === undefined) return `${subject}\n`;
    // `pnpm run` starts scripts in the package root; INIT_CWD is where the command was typed.
    const path = resolve(process.env.INIT_CWD ?? process.cwd(), options.messageFile);
    const body = readFileSync(path, 'utf8').trim();
    return body === '' ? `${subject}\n` : `${subject}\n\n${body}\n`;
}

/**
 * Waits for the CI runs on `sha`, then watches each to the end. A run asked for by id before it
 * exists is a 404, so this first polls the list until the commit has a run.
 */
async function watchCi(sha) {
    let runs = [];
    for (
        let attempt = 0;
        attempt < CI_APPEAR_ATTEMPTS && runs.length === 0;
        attempt += 1
    ) {
        if (attempt > 0) await sleep(CI_APPEAR_INTERVAL_MS);
        runs = JSON.parse(
            gh(['run', 'list', '--commit', sha, '--json', 'databaseId,name'])
        );
    }
    if (runs.length === 0) {
        fail(`No CI run appeared for ${sha}. Check with: gh run list --commit ${sha}`);
    }
    let failed = false;
    for (const { databaseId, name } of runs) {
        console.log(`Watching "${name}" (run ${databaseId})`);
        try {
            await run('gh', ['run', 'watch', '--exit-status', String(databaseId)], {
                cwd: mainCheckout,
            });
        } catch {
            failed = true;
            const { conclusion } = JSON.parse(
                gh(['run', 'view', String(databaseId), '--json', 'conclusion'])
            );
            if (conclusion === 'cancelled') {
                console.log(
                    `Run ${databaseId} was cancelled, usually by a newer push to ${MAIN}.`
                );
                continue;
            }
            // A job that failed before any step ran (no runner, say) has no step log, so the
            // run's summary, which names the job and the reason, stands in for it.
            const id = String(databaseId);
            const log =
                gh(['run', 'view', id, '--log-failed']).trim() || gh(['run', 'view', id]);
            console.log(`\nThe last ${FAILED_LOG_LINES} lines of what failed:`);
            console.log(log.split('\n').slice(-FAILED_LOG_LINES).join('\n'));
        }
    }
    if (failed) fail(`CI did not pass on ${sha}. The merge is already on ${MAIN}.`);
    console.log('CI passed.');
}

/** Runs a command that changes something, or prints it under `--dry-run`. */
function change(command, args) {
    if (options.dryRun) {
        console.log(`  $ ${command} ${args.join(' ')}`);
        return Promise.resolve();
    }
    return run(command, args);
}

function git(args) {
    return execFileSync('git', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
    }).trim();
}

function gitOrNull(args) {
    try {
        return (
            execFileSync('git', args, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            }).trim() || null
        );
    } catch {
        return null;
    }
}

function gitSucceeds(args) {
    try {
        execFileSync('git', args, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function gh(args) {
    return execFileSync('gh', args, {
        cwd: mainCheckout,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
        maxBuffer: 64 * 1024 * 1024,
    });
}

function parseArguments(args) {
    const parsed = { dryRun: false, ci: true, messageFile: undefined };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--') continue;
        if (arg === '--dry-run') parsed.dryRun = true;
        else if (arg === '--no-ci') parsed.ci = false;
        else if (arg === '--message-file' && args[index + 1] !== undefined) {
            parsed.messageFile = args[index + 1];
            index += 1;
        } else {
            console.error(
                `Unknown argument: ${arg}\nUsage: land [--message-file <path>] [--no-ci] [--dry-run]`
            );
            process.exit(2);
        }
    }
    return parsed;
}

/** Stops before anything has changed, or after the change was undone. */
function refuse(message) {
    console.error(`\nRefused: ${message}`);
    process.exit(1);
}

function fail(message) {
    console.error(`\n${message}`);
    process.exit(1);
}
