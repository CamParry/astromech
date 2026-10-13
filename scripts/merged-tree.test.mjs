/**
 * Tests of `scripts/merged-tree.mjs` on throwaway git repositories.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { afterEach, test } from 'node:test';
import { mergedTree } from './merged-tree.mjs';

// A git hook runs these tests with `GIT_INDEX_FILE` and `GIT_DIR` naming the
// repository being committed to. Inherited, they would send the throwaway
// repositories' writes to its index. The user's own config, such as commit
// signing, stays out too.
for (const name of Object.keys(process.env)) {
    if (name.startsWith('GIT_')) Reflect.deleteProperty(process.env, name);
}
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
process.env.GIT_CONFIG_NOSYSTEM = '1';

let directories = [];

afterEach(() => {
    for (const directory of directories) {
        rmSync(directory, { recursive: true, force: true });
    }
    directories = [];
});

/**
 * A repository with `a.txt` and `b.txt` on `main`, and `topic` branched from
 * it. Returns the directory, a git runner and a helper that commits files.
 */
function repository() {
    const directory = mkdtempSync(join(tmpdir(), 'astromech-merged-tree-test-'));
    directories.push(directory);
    const git = (...args) =>
        execFileSync('git', args, {
            cwd: directory,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    const commit = (branch, files) => {
        git('switch', '-q', branch);
        for (const [path, content] of Object.entries(files)) {
            writeFileSync(join(directory, path), content);
        }
        git('add', '.');
        git('commit', '-q', '-m', `change ${Object.keys(files).join(', ')}`);
    };
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(directory, 'a.txt'), 'a\n');
    writeFileSync(join(directory, 'b.txt'), 'b\n');
    git('add', '.');
    git('commit', '-q', '-m', 'first');
    git('branch', 'topic');
    return { directory, git, commit };
}

/** The content of `path` in `tree`. */
function show(git, tree, path) {
    return git('cat-file', 'blob', `${tree}:${path}`);
}

test('a branch behind main with no conflict gets a tree holding both sides', () => {
    const { directory, git, commit } = repository();
    commit('main', { 'a.txt': 'a from main\n' });
    commit('topic', { 'b.txt': 'b from topic\n' });
    const { tree, conflicts } = mergedTree(directory, 'main', 'topic');
    assert.deepEqual(conflicts, []);
    assert.equal(show(git, tree, 'a.txt'), 'a from main');
    assert.equal(show(git, tree, 'b.txt'), 'b from topic');
    // Not the branch's own tree, which would revert main's commit.
    assert.notEqual(tree, git('rev-parse', 'topic^{tree}'));
});

test("a branch that contains main gets the branch's tree", () => {
    const { directory, git, commit } = repository();
    commit('main', { 'a.txt': 'a from main\n' });
    git('switch', '-q', 'topic');
    git('merge', '-q', '--ff-only', 'main');
    commit('topic', { 'b.txt': 'b from topic\n' });
    const { tree, conflicts } = mergedTree(directory, 'main', 'topic');
    assert.deepEqual(conflicts, []);
    assert.equal(tree, git('rev-parse', 'topic^{tree}'));
});

test('a conflict gives no tree, and names the conflicted path', () => {
    const { directory, commit } = repository();
    commit('main', { 'a.txt': 'a from main\n', 'b.txt': 'b from main\n' });
    commit('topic', { 'a.txt': 'a from topic\n' });
    assert.deepEqual(mergedTree(directory, 'main', 'topic'), {
        tree: undefined,
        conflicts: ['a.txt'],
    });
});

test('an unknown commit is an error, not a conflict', () => {
    // git exits 1 here, as it does on a conflict.
    const { directory } = repository();
    assert.throws(
        () => mergedTree(directory, 'main', 'missing'),
        /exit 1\):\nmerge-tree: missing - not something we can merge/
    );
});
