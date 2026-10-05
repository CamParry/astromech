/**
 * Runs the Bash hook as Claude Code does, with the input JSON on stdin, against a throwaway
 * repository laid out like this one: a main checkout and a sibling `-worktrees` directory.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const hook = join(dirname(fileURLToPath(import.meta.url)), 'guard-bash-commands.mjs');

// Keep the developer's git config (signing, hooks) and the variables git exports to its own hooks
// (`GIT_INDEX_FILE` in a pre-commit run) out of the throwaway repository.
const gitEnvironment = {
    ...Object.fromEntries(
        Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
    ),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
};

let root;
let site;
let worktrees;
let worktree;

before(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'bash-hook-')));
    site = join(root, 'site');
    worktrees = join(root, 'site-worktrees');
    worktree = join(worktrees, 'feature');
    git(root, 'init', '-q', '-b', 'main', site);
    git(site, 'commit', '-q', '--allow-empty', '-m', 'first');
    git(site, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(site, 'branch', 'merged');
    git(site, 'worktree', 'add', '-q', '-b', 'feature', worktree);
    git(worktree, 'commit', '-q', '--allow-empty', '-m', 'unmerged work');
});

after(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('destructive git calls', () => {
    it('asks before each one in the main checkout, naming the command', () => {
        const commands = [
            'git reset --hard origin/main',
            'git reset --merge',
            'git reset --keep HEAD~1',
            'git clean -fd',
            'git clean --force',
            'git checkout -f main',
            'git checkout .',
            'git checkout -- a.txt',
            'git checkout HEAD -- a.txt',
            'git restore a.txt',
            'git restore --staged --worktree a.txt',
            'git worktree remove --force ../elsewhere',
        ];
        for (const command of commands) {
            const result = runHook(command);
            assert.equal(result.decision, 'ask', command);
            assert.match(result.reason, new RegExp(escapeRegExp(command)), command);
        }
    });

    it('asks for the main-checkout restore from the session log', () => {
        const result = runHook(
            `cd "${site}" && git diff roadmap/backlog.md > "$TMPDIR/backlog.patch" && git checkout -- roadmap/backlog.md`
        );
        assert.equal(result.decision, 'ask');
        assert.match(result.reason, /git checkout -- roadmap\/backlog\.md/);
    });

    it('lets each one run inside the worktree directory', () => {
        const commands = [
            `cd "${worktree}" && git checkout -- apps/demo/astromech.config.ts`,
            `cd "${worktree}" && git reset --hard origin/main`,
            `cd "${worktree}" && git clean -fd && git restore .`,
            `cd ../site-worktrees/feature && git reset --hard`,
            `git -C "${worktree}" checkout -- a.txt`,
            `git -C ../site-worktrees/feature restore a.txt`,
            `(cd "${worktree}" && git checkout .)`,
            `cd "${site}" && git worktree remove --force "${worktrees}/backup-restore"`,
            `git worktree remove --force ../site-worktrees/feature`,
        ];
        for (const command of commands) {
            assert.equal(runHook(command).decision, null, command);
        }
    });

    it('judges each call by the directory it runs in', () => {
        assert.equal(
            runHook(`cd "${worktree}" && cd "${site}" && git restore a.txt`).decision,
            'ask'
        );
        assert.equal(runHook(`(cd "${worktree}") && git restore a.txt`).decision, 'ask');
        assert.equal(runHook('git restore a.txt', worktree).decision, null);
        assert.equal(runHook(`git -C "${site}" restore a.txt`, worktree).decision, 'ask');
        assert.equal(runHook(`cd "$SOMEWHERE" && git restore a.txt`).decision, 'ask');
    });

    it('lets the safe forms run anywhere', () => {
        const commands = [
            'git reset --soft HEAD~1',
            'git reset HEAD a.txt',
            'git restore --staged a.txt',
            'git checkout main',
            'git checkout -q --detach origin/main',
            'git checkout -b topic',
            'git clean -n',
            'git stash list',
            'git stash pop',
            'git stash apply',
            'git push origin main',
            `git worktree remove "${worktree}"`,
            'git status && git diff && git log --oneline -5',
        ];
        for (const command of commands) {
            assert.equal(runHook(command).decision, null, command);
        }
    });

    it('ignores destructive commands written inside messages, heredocs and comments', () => {
        const commands = [
            `cd "${worktree}" && git fetch -q && git checkout -q --detach origin/main && git merge --no-ff feature -m "Merge branch 'backup-restore': git restore and git reset --hard"`,
            'git commit -m "Run git restore . or git checkout -- a.txt, never git reset --hard"',
            "git commit -F - <<'EOF'\nfix: guard\n\nNever git reset --hard; git clean -fd (it's gone).\nEOF",
            "git commit -m \"$(cat <<'EOF'\nfix: guard\n\nDon't git restore (or git branch -D x) here.\nEOF\n)\"",
            'echo "git branch -D feature" && printf \'%s\' "git push --force"',
            'ls # git reset --hard',
        ];
        for (const command of commands) {
            assert.equal(runHook(command).decision, null, command);
        }
    });

    it('asks for one hidden behind a wrapper or a nested shell', () => {
        const commands = [
            'bash -c "git reset --hard"',
            "sh -lc 'cd /tmp && git checkout -- a.txt'",
            'env GIT_TRACE=1 git restore a.txt',
            'echo "$(git restore a.txt)"',
            'eval git clean -fd',
            'find . -name "*.ts" -exec git checkout -- {} \\;',
            'git --no-pager -c core.pager=cat restore a.txt',
        ];
        for (const command of commands) {
            assert.equal(runHook(command).decision, 'ask', command);
        }
    });

    it('asks for every force push, even inside the worktree directory', () => {
        const commands = [
            `cd "${worktree}" && git push --force-with-lease origin feature`,
            `cd "${worktree}" && git push -f origin feature`,
            `cd "${worktree}" && git push origin +feature`,
            'git push --force origin main',
        ];
        for (const command of commands) {
            assert.equal(runHook(command).decision, 'ask', command);
        }
    });

    it('asks before dropping or clearing the stash, which every worktree shares', () => {
        for (const command of ['git stash drop', 'git stash clear']) {
            assert.equal(runHook(command).decision, 'ask', command);
            assert.equal(
                runHook(`cd "${worktree}" && ${command}`).decision,
                'ask',
                command
            );
        }
    });
});

describe('branch deletion', () => {
    it('lets a merged branch go without a prompt', () => {
        assert.equal(runHook('git branch -D merged').decision, null);
        assert.equal(
            runHook(
                `cd "${site}" && git worktree remove "../site-worktrees/core-small-defects" && git branch -D merged >/dev/null && echo removed`
            ).decision,
            null
        );
        assert.equal(
            runHook(
                `cd "${site}" && git worktree remove --force "${worktrees}/backup-restore" && git branch -D merged && git pull -q --ff-only origin main`
            ).decision,
            null
        );
    });

    it('asks before deleting an unmerged branch, naming it', () => {
        for (const command of [
            'git branch -D feature',
            'git branch -D merged feature',
            'git branch --delete --force feature',
            `cd "${worktree}" && git branch -D feature`,
        ]) {
            const result = runHook(command);
            assert.equal(result.decision, 'ask', command);
            assert.match(result.reason, /feature/, command);
        }
    });

    it('asks when it cannot tell which branch is deleted', () => {
        assert.equal(runHook('git branch -D "$BRANCH"').decision, 'ask');
        assert.equal(
            runHook('git branch --merged | xargs git branch -D').decision,
            'ask'
        );
        assert.equal(runHook('git branch -D missing').decision, 'ask');
    });
});

describe('process kills', () => {
    it('refuses pkill and killall, pointing at kill <pid>', () => {
        for (const command of [
            'pkill -f astro',
            'killall node',
            'sudo pkill node',
            'cd /tmp; pkill -f "astro dev"',
        ]) {
            const result = runHook(command);
            assert.equal(result.decision, 'deny', command);
            assert.match(result.reason, /kill <pid>/, command);
        }
    });

    it('lets kill <pid> run', () => {
        assert.equal(runHook('kill 1234').decision, null);
        assert.equal(runHook('command -v pkill').decision, null);
    });
});

describe('git stash', () => {
    it('refuses a stash inside the worktree directory, pointing at a wip commit', () => {
        for (const command of [
            `cd "${worktree}" && git stash`,
            `cd "${worktree}" && git stash push -m wip`,
            `cd "${worktree}" && git stash save`,
            `cd "${worktree}" && git stash -u`,
            `cd "${worktree}" && echo $(git stash)`,
        ]) {
            const result = runHook(command);
            assert.equal(result.decision, 'deny', command);
            assert.match(result.reason, /wip:/, command);
        }
    });

    it('asks before a stash in the main checkout', () => {
        assert.equal(runHook(`cd "${site}" && git stash`).decision, 'ask');
        assert.equal(
            runHook(`cd "${site}" && git stash push -m "before worktree work"`).decision,
            'ask'
        );
    });

    it('lets the stash be read and applied anywhere', () => {
        for (const command of [
            'git stash list',
            'git stash show -p',
            'git stash pop',
            'git stash apply',
        ]) {
            assert.equal(
                runHook(`cd "${worktree}" && ${command}`).decision,
                null,
                command
            );
        }
    });
});

describe('commands it cannot parse', () => {
    it('asks rather than guess', () => {
        for (const command of [
            'git commit -m "unterminated',
            "git log 'open",
            'echo $(git status',
            'git status )',
        ]) {
            const result = runHook(command);
            assert.equal(result.decision, 'ask', command);
            assert.match(result.reason, /could not parse/, command);
        }
    });
});

describe('commands that touch nothing it guards', () => {
    it('stays silent', () => {
        for (const command of [
            'ls -la',
            'pnpm run verify:fast',
            'cat <<EOF\ngit reset --hard',
        ]) {
            assert.equal(runHook(command).decision, null, command);
        }
    });
});

/** Runs the hook on one command and returns its decision (`null` when it prints nothing). */
function runHook(command, cwd = site) {
    const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        cwd,
        tool_input: { command },
    };
    const result = spawnSync(process.execPath, [hook], {
        input: JSON.stringify(input),
        encoding: 'utf8',
        env: { ...gitEnvironment, CLAUDE_PROJECT_DIR: site },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    if (result.stdout.trim() === '') return { decision: null, reason: '' };
    const output = JSON.parse(result.stdout).hookSpecificOutput;
    assert.equal(output.hookEventName, 'PreToolUse');
    return {
        decision: output.permissionDecision,
        reason: output.permissionDecisionReason,
    };
}

function git(cwd, ...args) {
    execFileSync('git', args, { cwd, env: gitEnvironment, stdio: 'ignore' });
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
