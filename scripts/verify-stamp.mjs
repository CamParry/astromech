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
 * - `stamp.json` is written when a run passes: the mode, HEAD, a hash of the
 *   uncommitted changes, the time and the result. A failed run removes it.
 *
 * The stamp is what a lead reads instead of rerunning a gate a sub-agent ran:
 * the script writes it, so it does not rest on the agent's report.
 * `pnpm run verify:status` (`scripts/verify-status.mjs`) compares it with the
 * worktree. A full run covers the fast and runtime modes, since it runs every
 * check they run; neither of those covers another mode.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    lstatSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    readlinkSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

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
 * HEAD, and a hash of everything the working tree adds to it: the tracked
 * changes, staged or not (`git diff HEAD`), and each untracked file that git
 * does not ignore, by path and content. Two calls on an unchanged tree return
 * the same hash, whatever the files' timestamps.
 */
export function treeState(repoRoot) {
    const head = git(repoRoot, 'rev-parse', 'HEAD').toString().trim();
    const hash = createHash('sha256');
    hash.update(
        git(
            repoRoot,
            'diff',
            'HEAD',
            '--binary',
            '--no-color',
            '--no-ext-diff',
            '--no-textconv',
            '--no-renames'
        )
    );
    const untracked = git(repoRoot, 'ls-files', '--others', '--exclude-standard', '-z')
        .toString()
        .split('\0')
        .filter((path) => path !== '')
        .sort();
    for (const path of untracked) {
        hash.update(`\0${path}\0`);
        hash.update(untrackedContent(join(repoRoot, path)));
    }
    return { head, changes: hash.digest('hex') };
}

/** Records a passing run of `mode` over `state`. */
export function writeStamp(directory, mode, state) {
    const stamp = {
        mode,
        head: state.head,
        changes: state.changes,
        finishedAt: new Date().toISOString(),
        result: 'passed',
    };
    writeFileSync(stampPath(directory), `${JSON.stringify(stamp, null, 4)}\n`);
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
    const ran = `a ${stamp.mode} run passed at ${stamp.finishedAt} on ${stamp.head.slice(0, 8)}`;
    if (mode !== undefined && !COVERED_MODES[stamp.mode]?.includes(mode)) {
        return { matches: false, message: `${ran}, which does not cover ${mode}` };
    }
    const state = treeState(repoRoot);
    if (stamp.head !== state.head) {
        return {
            matches: false,
            message: `${ran}, but HEAD is ${state.head.slice(0, 8)}`,
        };
    }
    if (stamp.changes !== state.changes) {
        return {
            matches: false,
            message: `${ran}, but the uncommitted changes differ from that run's`,
        };
    }
    return { matches: true, message: `${ran}, with the same uncommitted changes` };
}

function readStamp(directory) {
    try {
        const stamp = JSON.parse(readFileSync(stampPath(directory), 'utf8'));
        return typeof stamp?.head === 'string' && typeof stamp?.mode === 'string'
            ? stamp
            : undefined;
    } catch {
        return undefined;
    }
}

/**
 * A file's content; a symlink's target, without following it; nothing for a
 * directory, which git lists for a nested repository.
 */
function untrackedContent(path) {
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) return readlinkSync(path);
    if (stats.isDirectory()) return '';
    return readFileSync(path);
}

/** A git command's stdout, as a buffer of any size. */
function git(repoRoot, ...args) {
    return execFileSync('git', args, {
        cwd: repoRoot,
        maxBuffer: Number.POSITIVE_INFINITY,
        stdio: ['ignore', 'pipe', 'ignore'],
    });
}
