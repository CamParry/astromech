/**
 * What the gate (`scripts/verify.mjs`) leaves in a worktree: each check's log
 * and a stamp recording the last passing run.
 *
 * Both live in `verify/` inside the worktree's own git directory
 * (`git rev-parse --absolute-git-dir`), so each worktree has its own, git never
 * tracks them, and a reader finds them from the worktree alone.
 *
 * - `<check>.log` holds a check's whole output from the latest run, stdout and
 *   stderr as the check printed them. Each run removes the previous run's logs.
 * - `stamp.json` is written when a run passes: the mode, the git tree id of
 *   the working tree, HEAD, the time and the result. A passing run keeps a
 *   stamp of the same tree whose mode already covers its own, so a fast run
 *   after a full one leaves the full stamp. A failed run removes it.
 *
 * The tree id is the one a commit of the working tree would point at: tracked
 * files as they are on disk, plus untracked files git does not ignore. So the
 * stamp still matches after the verified changes are committed, and stops
 * matching when any file changes, including a reformat by the pre-commit hook.
 * HEAD is kept only to name the commit in messages.
 *
 * The stamp is what a lead reads instead of rerunning a gate a sub-agent ran:
 * the script writes it, so it does not rest on the agent's report. It guards
 * against a mistaken report, not a forged one: nothing stops a hand-written
 * file.
 * `pnpm run verify:status` (`scripts/verify-status.mjs`) compares it with the
 * worktree. A full run covers the fast and runtime modes, since it runs every
 * check they run; neither of those covers another mode.
 */
import { execFileSync } from 'node:child_process';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

/** The modes each mode's passing run covers. */
const COVERED_MODES = {
    full: ['full', 'fast', 'runtime'],
    fast: ['fast'],
    runtime: ['runtime'],
};

/** The worktree's `verify/` directory. It may not exist yet. */
export function verifyDirectory(repoRoot) {
    return join(
        git(repoRoot, 'rev-parse', '--absolute-git-dir').toString().trim(),
        'verify'
    );
}

/** Creates the `verify/` directory and removes the logs an earlier run left. */
export function prepareVerifyDirectory(repoRoot) {
    const directory = verifyDirectory(repoRoot);
    mkdirSync(directory, { recursive: true });
    for (const entry of readdirSync(directory)) {
        if (entry.endsWith('.log')) rmSync(join(directory, entry));
    }
    return directory;
}

/** Where a check's output goes. */
export function logPath(directory, check) {
    return join(directory, `${check}.log`);
}

/** Where the stamp goes. */
export function stampPath(directory) {
    return join(directory, 'stamp.json');
}

/**
 * HEAD, and the git tree id of the working tree. The tree is written through a
 * copy of the index (`git add -A` then `git write-tree`), so the real index is
 * never touched; the copy is removed afterwards. Two calls on an unchanged tree
 * return the same id, whatever the files' timestamps.
 */
export function treeState(repoRoot) {
    const head = git(repoRoot, 'rev-parse', 'HEAD').toString().trim();
    const index = resolve(
        repoRoot,
        git(repoRoot, 'rev-parse', '--git-path', 'index').toString().trim()
    );
    const scratch = mkdtempSync(join(tmpdir(), 'astromech-verify-'));
    try {
        const copy = join(scratch, 'index');
        if (existsSync(index)) copyFileSync(index, copy);
        const env = { ...process.env, GIT_INDEX_FILE: copy };
        gitWith(repoRoot, env, 'add', '-A');
        const tree = gitWith(repoRoot, env, 'write-tree').toString().trim();
        return { head, tree };
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

/**
 * Records a passing run of `mode` over `state`, unless the stamp already
 * records a run of the same tree in a wider mode that covers `mode`. Returns
 * the stamp left in place.
 */
export function writeStamp(directory, mode, state) {
    const existing = readStamp(directory);
    if (
        existing?.tree === state.tree &&
        existing.mode !== mode &&
        COVERED_MODES[existing.mode]?.includes(mode)
    ) {
        return existing;
    }
    const stamp = {
        mode,
        tree: state.tree,
        head: state.head,
        finishedAt: new Date().toISOString(),
        result: 'passed',
    };
    writeFileSync(stampPath(directory), `${JSON.stringify(stamp, null, 4)}\n`);
    return stamp;
}

/** Removes the stamp, if there is one. */
export function removeStamp(directory) {
    rmSync(stampPath(directory), { force: true });
}

/**
 * Compares the stamp with the worktree. `mode` is the mode the caller needs
 * covered, or undefined for any mode. Returns whether the stamp matches and a
 * line saying why.
 */
export function stampStatus(repoRoot, mode) {
    const directory = verifyDirectory(repoRoot);
    const stamp = readStamp(directory);
    if (stamp === undefined) {
        return {
            matches: false,
            message:
                'no passing run recorded (none has run here, or the last run failed)',
        };
    }
    const ran = `a ${stamp.mode} run passed at ${stamp.finishedAt} on ${short(stamp.head)}`;
    if (mode !== undefined && !COVERED_MODES[stamp.mode]?.includes(mode)) {
        return { matches: false, message: `${ran}, which does not cover ${mode}` };
    }
    const state = treeState(repoRoot);
    if (stamp.tree !== state.tree) {
        return {
            matches: false,
            message: `${ran}, but the working tree's content differs (tree ${short(state.tree)}, was ${short(stamp.tree)})`,
        };
    }
    const moved =
        stamp.head === state.head ? '' : `; HEAD has moved to ${short(state.head)}`;
    return {
        matches: true,
        message: `${ran}, on the same content (tree ${short(state.tree)})${moved}`,
    };
}

function readStamp(directory) {
    try {
        const stamp = JSON.parse(readFileSync(stampPath(directory), 'utf8'));
        return typeof stamp?.tree === 'string' && typeof stamp?.mode === 'string'
            ? stamp
            : undefined;
    } catch {
        return undefined;
    }
}

function short(id) {
    return String(id).slice(0, 8);
}

/** A git command's stdout, as a buffer of any size. */
function git(repoRoot, ...args) {
    return gitWith(repoRoot, process.env, ...args);
}

function gitWith(repoRoot, env, ...args) {
    return execFileSync('git', args, {
        cwd: repoRoot,
        env,
        maxBuffer: Number.POSITIVE_INFINITY,
        stdio: ['ignore', 'pipe', 'ignore'],
    });
}
