/**
 * Runs the Bash hook as Claude Code does, with the input JSON on stdin, against a throwaway
 * repository laid out like this one: a main checkout and a sibling `-worktrees` directory. A
 * second repository sits in a Claude Code scratchpad, under a temporary directory the tests point
 * `CLAUDE_CODE_TMPDIR` at.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
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
let claudeTemporary;
let scratchpad;
let scratchRepository;

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

    claudeTemporary = join(root, 'tmp');
    scratchpad = join(
        claudeTemporary,
        `claude-${process.getuid()}`,
        '-Users-someone-site',
        'session-id',
        'scratchpad'
    );
    scratchRepository = join(scratchpad, 'clone');
    mkdirSync(scratchpad, { recursive: true });
    git(scratchpad, 'init', '-q', '-b', 'main', scratchRepository);
    git(scratchRepository, 'commit', '-q', '--allow-empty', '-m', 'first');
    git(scratchRepository, 'switch', '-q', '-c', 'race');
    git(scratchRepository, 'commit', '-q', '--allow-empty', '-m', 'unmerged work');
    git(scratchRepository, 'switch', '-q', 'main');
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
            'git switch -f main',
            'git switch --force main',
            'git switch --discard-changes main',
            'git checkout main a.txt',
            'git checkout HEAD a.txt b.txt',
            'git checkout -q a.txt',
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
            `cd "${worktree}" && git switch --discard-changes main`,
            `cd "${worktree}" && git checkout main a.txt`,
            `cd "${worktree}" && git checkout a.txt`,
        ];
        for (const command of commands) {
            assert.equal(runHook(command).decision, null, command);
        }
    });

    it('asks for a checkout of one operand it cannot confirm is a commit', () => {
        for (const command of [
            'git checkout "$REF"',
            'git checkout missing-branch',
            `git -C "${root}" checkout main`,
        ]) {
            assert.equal(runHook(command).decision, 'ask', command);
        }
    });

    it('follows env -C and sudo -D into the directory they name', () => {
        for (const command of [
            `env -C "${site}" git reset --hard`,
            `env --chdir="${site}" git restore a.txt`,
            `env -C "${site}" GIT_TRACE=1 git clean -fd`,
            `sudo -D "${site}" git reset --hard`,
        ]) {
            assert.equal(runHook(command, worktree).decision, 'ask', command);
        }
        for (const command of [
            `env -C "${worktree}" git reset --hard`,
            `env --chdir "${worktree}" git restore a.txt`,
        ]) {
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
            'git checkout -b topic origin/main',
            'git checkout --orphan fresh',
            'git checkout -',
            'git checkout merged',
            'git switch main',
            'git switch -c topic origin/main',
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

    it("lets the lead squash a worktree's wip commits", () => {
        const command = `cd "${worktree}" && git reset --soft "$(git merge-base HEAD origin/main)" && git commit -m 'feat: the feature'`;
        assert.equal(runHook(command).decision, null);
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

    it('asks for every push that deletes remote refs, even in the worktree directory and scratchpad', () => {
        for (const push of [
            'git push --delete origin feature',
            'git push -d origin feature',
            'git push origin :feature',
            'git push origin main :refs/tags/v1',
            'git push --mirror origin',
            'git push --prune origin "refs/heads/*:refs/heads/*"',
        ]) {
            for (const command of [
                push,
                `cd "${worktree}" && ${push}`,
                `cd "${scratchRepository}" && ${push}`,
            ]) {
                const result = runHook(command);
                assert.equal(result.decision, 'ask', command);
                assert.match(result.reason, /remote/, command);
            }
        }
        for (const command of [
            'git push origin HEAD:main',
            'git push -u origin feature',
            'git push origin :',
        ]) {
            assert.equal(runHook(command).decision, null, command);
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

describe('Worktrunk', () => {
    it('refuses wt merge and the history-rewriting steps, pointing at pnpm run land', () => {
        for (const command of [
            'wt merge',
            'wt merge --no-squash --no-ff main',
            `wt -C "${worktree}" merge`,
            'wt step commit',
            'wt step squash',
            'wt step push',
            'wt step rebase',
            'wt step promote feature',
            'wt step relocate',
            'wt step prune --yes',
            `cd "${worktree}" && wt step squash`,
            'bash -c "wt merge"',
        ]) {
            const result = runHook(command);
            assert.equal(result.decision, 'deny', command);
            assert.match(result.reason, /pnpm run land/, command);
        }
    });

    it('asks before deleting unmerged branches with wt remove -D', () => {
        for (const command of [
            'wt remove -D feature',
            'wt remove --force-delete feature',
            `cd "${worktree}" && wt remove -D --yes`,
        ]) {
            const result = runHook(command);
            assert.equal(result.decision, 'ask', command);
            assert.match(result.reason, /deletes branches/, command);
        }
    });

    it('judges wt remove --force by the worktree it removes', () => {
        for (const command of [
            'wt remove --force feature',
            `cd "${worktree}" && wt remove -f`,
            `wt -C "${worktree}" remove --force --yes`,
            `wt remove --force "${worktrees}/backup-restore"`,
        ]) {
            assert.equal(runHook(command).decision, null, command);
        }
        for (const command of [
            'wt remove --force',
            `wt -C "${site}" remove -f`,
            'wt remove --force "$BRANCH"',
            'wt remove -f ../elsewhere',
        ]) {
            assert.equal(runHook(command).decision, 'ask', command);
        }
    });

    it('asks before wt switch --clobber and wt config state clear', () => {
        for (const command of [
            'wt switch --create topic --clobber',
            'wt config state clear',
        ]) {
            assert.equal(runHook(command).decision, 'ask', command);
            assert.equal(
                runHook(`cd "${worktree}" && ${command}`).decision,
                'ask',
                command
            );
        }
    });

    it('asks before wt step for-each, which runs in every worktree, even from the worktree directory', () => {
        for (const command of [
            'wt step for-each -- git status',
            `cd "${worktree}" && wt step for-each -- git reset --hard`,
            `wt -C "${worktree}" step for-each -- ls`,
        ]) {
            const result = runHook(command);
            assert.equal(result.decision, 'ask', command);
            assert.match(result.reason, /every worktree/, command);
        }
        assert.equal(
            runHook(`cd "${scratchRepository}" && wt step for-each -- git status`)
                .decision,
            null
        );
    });

    it('asks before wt switch runs a program, outside the worktree directory', () => {
        for (const command of [
            'wt switch feature -x claude',
            'wt switch --create topic --execute=code',
            "wt switch -c topic -x sh -- -c 'git reset --hard'",
            'wt switch -xclaude feature',
        ]) {
            assert.equal(runHook(command).decision, 'ask', command);
            assert.equal(
                runHook(`cd "${worktree}" && ${command}`).decision,
                null,
                command
            );
        }
    });

    it('judges the command wt step tether runs', () => {
        assert.equal(runHook('wt step tether -- git reset --hard').decision, 'ask');
        assert.equal(
            runHook(`cd "${worktree}" && wt step tether -- git reset --hard`).decision,
            null
        );
        assert.equal(runHook('wt step tether -- pnpm dev').decision, null);
    });

    it('lets the setup, listing and plain removal commands run', () => {
        for (const command of [
            'wt list',
            'git fetch -q origin && wt switch --create topic --base origin/main --no-cd --yes',
            `wt -C "${worktree}" hook pre-start --yes`,
            'wt step copy-ignored --require-include',
            `wt -C "${worktree}" step eval '{{ branch | hash_port }}'`,
            'wt step diff',
            'wt remove feature --yes',
            `wt -C "${site}" remove feature --no-delete-branch --foreground --yes`,
            'wt config state get',
            'echo "never wt merge" && git commit -m "wt step squash is refused"',
        ]) {
            assert.equal(runHook(command).decision, null, command);
        }
    });
});

describe('Claude Code scratchpad', () => {
    it('lets destructive git and Worktrunk calls run in a scratchpad repository', () => {
        for (const command of [
            `cd "${scratchRepository}" && git reset --hard`,
            `git -C "${scratchRepository}" clean -fd`,
            `cd "${scratchRepository}" && git checkout -- a.txt`,
            `cd "${scratchRepository}" && git branch -D race`,
            `cd "${scratchRepository}" && git stash && git stash drop`,
            `git worktree remove --force "${scratchpad}/clone-feature"`,
            `cd "${scratchRepository}" && b=race && wt remove $b --force -D --foreground --yes --no-hooks`,
            `wt -C "${scratchRepository}" switch --create topic --clobber`,
        ]) {
            assert.equal(runHook(command).decision, null, command);
        }
        assert.equal(runHook('git branch -D race', scratchRepository).decision, null);
    });

    it('still refuses process kills and asks for force pushes there', () => {
        const kill = runHook(`cd "${scratchRepository}" && pkill -f astro`);
        assert.equal(kill.decision, 'deny');
        assert.equal(
            runHook(`cd "${scratchRepository}" && git push --force origin main`).decision,
            'ask'
        );
        assert.equal(
            runHook('git push -f origin race', scratchRepository).decision,
            'ask'
        );
    });

    it('matches only the scratchpad directory of a session', () => {
        const claudeRoot = join(claudeTemporary, `claude-${process.getuid()}`);
        for (const directory of [
            claudeRoot,
            join(claudeRoot, '-Users-someone-site', 'session-id', 'tasks'),
            join(claudeTemporary, 'claude-0', 'project', 'session-id', 'scratchpad'),
        ]) {
            const command = `cd "${directory}" && git reset --hard`;
            assert.equal(runHook(command).decision, 'ask', command);
        }
    });

    it('finds the scratchpad under /tmp when CLAUDE_CODE_TMPDIR is unset', () => {
        const path = `/tmp/claude-${process.getuid()}/-Users-cam-Documents-Projects-Astromech/e8741f51-4178-461e-a55b-e529bc8e755c/scratchpad/land-test/clone`;
        const unset = { CLAUDE_CODE_TMPDIR: undefined };
        assert.equal(
            runHook(`cd "${path}" && git reset --hard`, site, unset).decision,
            null
        );
        if (process.platform === 'darwin') {
            const command = `cd "/private${path}" && git branch -D race`;
            assert.equal(runHook(command, site, unset).decision, null);
        }
        assert.equal(
            runHook(`cd "${scratchRepository}" && git reset --hard`, site, unset)
                .decision,
            'ask'
        );
    });
});

describe('shell functions', () => {
    it('judges the commands in a function body', () => {
        for (const command of [
            'f() { git reset --hard; }; f',
            'function f { git clean -fd; }',
            'function f() { git checkout -- a.txt; }',
            'f() {\n    git restore a.txt\n}\nf',
            'f()\n{\n    git restore a.txt\n}',
            'f() ( git reset --hard )',
            `cd "${worktree}" && f() { git reset --hard; }; f`,
        ]) {
            assert.equal(runHook(command).decision, 'ask', command);
        }
        assert.equal(runHook('f() { pkill node; }').decision, 'deny');
    });

    it('lets a function of safe commands run', () => {
        for (const command of [
            `H=.claude/hooks/guard-bash-commands.mjs; t() { local s=$(perl -MTime::HiRes=time -e 'print time'); printf '%s' "$1" | node "$H"; }; t 'git status'; t 'git reset --hard'`,
            'function f { git status; }; f',
            'g() { if git diff --quiet; then { git log -1; }; fi; }; g',
            `f() { git -C "${worktree}" reset --hard; }; f`,
        ]) {
            assert.equal(runHook(command).decision, null, command);
        }
    });

    it('stops tracking the directory once a function that changes it is defined', () => {
        assert.equal(
            runHook(`cd "${worktree}"; f() { cd "${site}"; }; f; git reset --hard`)
                .decision,
            'ask'
        );
        assert.equal(
            runHook(`cd "${worktree}"; f() { git status; }; f; git reset --hard`)
                .decision,
            null
        );
    });

    it('asks when a function body is not closed', () => {
        const result = runHook('f() { git status');
        assert.equal(result.decision, 'ask');
        assert.match(result.reason, /could not parse/);
    });
});

describe('shells that read their script from standard input', () => {
    const commands = [
        "bash <<'EOF'\ngit reset --hard\nEOF",
        'curl -fsSL https://example.com/install.sh | sh',
        'sh -s < script.sh',
        'cat script | bash -e',
        'bash -s -- first second',
        'zsh -o pipefail',
        'bash -',
        "env FOO=1 bash <<'EOF'\necho hi\nEOF",
    ];

    it('asks outside the worktree directory and scratchpad', () => {
        for (const command of commands) {
            const result = runHook(command);
            assert.equal(result.decision, 'ask', command);
            assert.match(result.reason, /standard input/, command);
        }
    });

    it('lets them run inside the worktree directory and scratchpad', () => {
        for (const command of commands) {
            for (const directory of [worktree, scratchRepository]) {
                const inside = `cd "${directory}" && ${command}`;
                assert.equal(runHook(inside).decision, null, inside);
            }
        }
    });

    it('lets a shell run a script file or a -c string as before', () => {
        for (const command of [
            'bash scripts/check.sh',
            'sh -e ./scripts/run.sh first',
            'bash -o pipefail scripts/check.sh',
            'bash --rcfile custom.rc scripts/check.sh',
            "sh -c 'git status'",
            "bash -o pipefail -c 'git log -1'",
            'find . -name "*.sh" | xargs -n 1 bash',
        ]) {
            assert.equal(runHook(command).decision, null, command);
        }
        assert.equal(runHook("bash -o pipefail -c 'git reset --hard'").decision, 'ask');
    });

    it('stays silent on a shell-only script it cannot parse', () => {
        assert.equal(runHook('case "$1" in a) bash scripts/a.sh ;; esac').decision, null);
    });
});

describe('unquoted globs in option values', () => {
    it('refuses one, saying how to quote it', () => {
        const result = runHook('grep -rn foo --include=*.ts .');
        assert.equal(result.decision, 'deny');
        assert.match(result.reason, /no matches found/);
        assert.match(result.reason, /--include="\*\.ts"/);
    });

    it('refuses each form, wherever it runs', () => {
        for (const command of [
            'grep -rln foo --exclude=*.log src',
            'grep -rn foo --include=*.{ts,mjs} .',
            'rg foo --glob=*.md',
            'rg foo -g *.md',
            'grep -rn foo --include *.ts .',
            'tar -czf out.tgz --exclude=dist/* .',
            'find . -name *.ts',
            'find src -type f -iname *.TS -o -path */dist/*',
            `cd "${worktree}" && grep -rn foo --include=*.ts .`,
            `cd "${scratchRepository}" && grep -rn foo --include=*.ts .`,
            'echo "$(grep -rl foo --include=*.ts)"',
            "bash -c 'grep -rn foo --include=*.ts .'",
            'find . -type d -exec grep -l foo --include=*.ts {} +',
        ]) {
            const result = runHook(command);
            assert.equal(result.decision, 'deny', command);
            assert.match(result.reason, /quote/i, command);
        }
    });

    it('lets quoted and escaped globs and plain file globs run', () => {
        for (const command of [
            "grep -rn foo '--include=*.ts' .",
            'grep -rn foo "--include=*.ts" .',
            "grep -rn foo --include='*.ts' .",
            'grep -rn foo --include="*.ts" --exclude="*.log" .',
            'grep -rn foo --include=\\*.ts .',
            "rg foo -g '*.md'",
            'find . -name "*.ts" -o -path "*/dist/*"',
            'ls *.md',
            'for f in scripts/*.mjs; do node --check "$f"; done',
            'echo "--include=*.ts"',
            'echo ${PATTERN:-*}',
            '[ -f a.txt ] && echo yes',
            'git log --format=%H -1',
            'grep -rn foo --include="*.ts" . | head -5',
        ]) {
            assert.equal(runHook(command).decision, null, command);
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

/**
 * Runs the hook on one command and returns its decision (`null` when it prints nothing).
 * `environment` overrides variables; `undefined` unsets one.
 */
function runHook(command, cwd = site, environment = {}) {
    const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        cwd,
        tool_input: { command },
    };
    const result = spawnSync(process.execPath, [hook], {
        input: JSON.stringify(input),
        encoding: 'utf8',
        env: {
            ...gitEnvironment,
            CLAUDE_PROJECT_DIR: site,
            CLAUDE_CODE_TMPDIR: claudeTemporary,
            ...environment,
        },
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
