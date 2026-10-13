/**
 * The tree a merge of two commits gives, written with
 * `git merge-tree --write-tree` (git 2.38 or later). It writes objects only:
 * no worktree, index or ref changes. `scripts/land.mjs` makes its merge
 * commit with this tree.
 */
import { spawnSync } from 'node:child_process';

/** A SHA-1 or SHA-256 object id. */
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * Merges `tip` into `base` in the repository at `cwd`. Returns
 * `{ tree, conflicts: [] }` for a clean merge, and `{ tree: undefined,
 * conflicts }` naming each conflicted path when the merge conflicts. Throws on
 * anything else, such as an unknown commit or a git too old for
 * `--write-tree`.
 */
export function mergedTree(cwd, base, tip) {
    const result = spawnSync(
        'git',
        ['merge-tree', '--write-tree', '--name-only', base, tip],
        { cwd, encoding: 'utf8' }
    );
    if (result.error !== undefined) throw result.error;
    // Exit 0: the tree's id. Exit 1 on a conflict: the id of a tree with
    // conflict markers, then each conflicted path on a line of its own, then
    // a blank line and git's messages. git also exits 1 on an unknown commit,
    // printing nothing on stdout, so a conflict is told by its tree id.
    const lines = result.stdout.split('\n');
    const hasTree = OBJECT_ID.test(lines[0]);
    if (result.status === 0 && hasTree) return { tree: lines[0], conflicts: [] };
    if (result.status === 1 && hasTree) {
        const end = lines.indexOf('', 1);
        const conflicts = lines.slice(1, end === -1 ? undefined : end);
        if (conflicts.length > 0) return { tree: undefined, conflicts };
    }
    throw new Error(
        `git merge-tree --write-tree ${base} ${tip} failed (exit ${result.status ?? result.signal}):\n${result.stderr}${result.stdout}`
    );
}
