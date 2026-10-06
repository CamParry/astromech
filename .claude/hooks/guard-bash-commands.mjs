#!/usr/bin/env node
/**
 * PreToolUse hook for Bash. It guards git and Worktrunk (`wt`) calls that can destroy
 * uncommitted work or rewrite history, and process and stash commands that reach into other
 * sessions' work.
 * Why: several sessions and agents share this machine and repository, so `git reset --hard` can
 * wipe another session's work, a broad `pkill` can stop its server, and `git stash` (repo-wide)
 * empties a worktree other agents are writing in. Branches land with `pnpm run land`, so `wt
 * merge` and the `wt step` commands that commit, squash, rebase or push are refused.
 *
 * It splits the command into simple commands (honouring quotes, dropping heredoc bodies and
 * comments), follows `cd`, `git -C` and `wt -C`, and decides each call by the directory it runs
 * in. The worktree directory is the main checkout's sibling `<name>-worktrees`.
 *
 * The scratchpad is any session's scratchpad directory, which Claude Code creates at
 * `<tmp>/claude-<uid>/<project>/<session>/scratchpad`, where `<tmp>` is `$CLAUDE_CODE_TMPDIR`,
 * else `/tmp` (`/private/tmp` on macOS). The hook compares real paths and needs the `scratchpad`
 * segment, so `<tmp>/claude-<uid>` itself and a session's other directories (its `tasks` output)
 * do not count. Agents build throwaway repositories there (bare remotes and clones to test
 * `land.mjs` and Worktrunk), so destroying their work loses nothing. A force push still asks,
 * since a scratch clone's remote can be a real one.
 *
 * A function body (`name() { …; }`, `function name { …; }`) is judged where it is defined, in a
 * directory the hook treats as unknown, since the function can run anywhere. A function whose body
 * changes directory leaves the directory unknown for the rest of the command.
 *
 * | Command                                                     | Worktree dir | Scratchpad | Elsewhere |
 * | ----------------------------------------------------------- | ------------ | ---------- | --------- |
 * | `reset --hard/--merge/--keep`, `clean -f`, `checkout -f`,   | silent       | silent     | ask       |
 * | `checkout .`, `checkout [<ref>] -- <paths>`, `restore`      |              |            |           |
 * | (working tree)                                              |              |            |           |
 * | `worktree remove --force <path>` (judged by `<path>`)       | silent       | silent     | ask       |
 * | `branch -D <names>`: every name in `origin/main` or `main`  | silent       | silent     | silent    |
 * | `branch -D <names>`: any other name                         | ask          | silent     | ask       |
 * | `push --force`, `-f`, `--force-with-lease`, `+<ref>`        | ask          | ask        | ask       |
 * | `stash drop`, `stash clear` (the stash is repo-wide)        | ask          | silent     | ask       |
 * | `stash`, `stash push`, `stash save`                         | deny         | silent     | ask       |
 * | `pkill`, `killall`                                          | deny         | deny       | deny      |
 * | `wt merge`; `wt step commit`, `squash`, `push`, `rebase`,   | deny         | deny       | deny      |
 * | `promote`, `relocate`, `prune`                              |              |            |           |
 * | `wt remove --force` (judged by the worktree it removes)     | silent       | silent     | ask       |
 * | `wt remove -D` (deletes unmerged branches)                  | ask          | silent     | ask       |
 * | `wt switch --clobber`, `wt config state clear`              | ask          | silent     | ask       |
 * | a command it cannot parse                                   | ask          | ask        | ask       |
 *
 * A call counts as in the scratchpad when it runs there. A forced worktree removal counts when the
 * worktree it removes is there, or when the hook cannot tell which worktree and the call runs there.
 *
 * Silent means no output, so the normal permission flow decides; the hook never answers `allow`,
 * which would also approve everything else in a compound command.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

// Commands that mention none of these words cannot match a rule, so they skip the parse.
const TRIGGER = /git|pkill|killall|\bwt\b/;

function main() {
    const input = readInput();
    const command = input?.tool_input?.command;
    if (typeof command !== 'string' || !TRIGGER.test(command)) return;

    let findings;
    try {
        findings = [];
        collectFindings(parseScript(command), input.cwd ?? process.cwd(), findings);
    } catch (error) {
        const detail = error instanceof ParseError ? error.message : String(error);
        respond('ask', [
            `The Bash hook could not parse this command (${detail}), so it asks before running it.`,
        ]);
        return;
    }

    const worktrees = lazy(() => findWorktreesDirectory(input));
    const claudeRoot = lazy(findClaudeTemporaryRoot);
    const inScratchpad = (path) => isInScratchpad(path, claudeRoot());
    const denials = [];
    const questions = [];
    for (const finding of findings) {
        const verdict = judge(finding, worktrees, inScratchpad);
        if (verdict?.decision === 'deny') denials.push(verdict.reason);
        if (verdict?.decision === 'ask') questions.push(verdict.reason);
    }
    if (denials.length > 0) respond('deny', denials);
    else if (questions.length > 0) respond('ask', questions);
}

/** Reads the hook input from stdin, or `null` when there is none. */
function readInput() {
    const text = readFileSync(0, 'utf8');
    if (text.trim() === '') return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function respond(decision, reasons) {
    const permissionDecisionReason = [...new Set(reasons)].join(' ');
    const output = {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: decision,
            permissionDecisionReason,
        },
    };
    process.stdout.write(`${JSON.stringify(output)}\n`);
}

/** Turns one finding into `{ decision, reason }`, or `undefined` when it needs no prompt. */
function judge(finding, worktrees, inScratchpad) {
    const quoted = `\`${finding.label}\``;
    switch (finding.kind) {
        case 'process-kill':
            return {
                decision: 'deny',
                reason: `${quoted} is refused: it matches processes by name, so it can stop another session's server or test run. Stop the process you started by its PID with \`kill <pid>\`.`,
            };
        case 'force-push':
            return {
                decision: 'ask',
                reason: `${quoted} rewrites history on the remote.`,
            };
        case 'refused':
            return { decision: 'deny', reason: `${quoted} is refused: ${finding.why}.` };
    }

    // Every other finding destroys work only in the repository it runs in.
    if (finding.kind === 'worktree-remove') {
        if (isInside(finding.target, worktrees())) return undefined;
        if (inScratchpad(finding.target ?? finding.directory)) return undefined;
    } else if (inScratchpad(finding.directory)) {
        return undefined;
    }

    switch (finding.kind) {
        case 'stash':
            if (isInside(finding.directory, worktrees())) {
                return {
                    decision: 'deny',
                    reason: `${quoted} is refused in the shared worktree directory: the stash belongs to the whole repository, and stashing empties a worktree other agents are writing in. Make a \`wip:\` commit instead.`,
                };
            }
            return {
                decision: 'ask',
                reason: `${quoted} stashes changes ${where(finding.directory, worktrees())}; the stash is shared by every worktree.`,
            };
        case 'working-tree':
            if (isInside(finding.directory, worktrees())) return undefined;
            return {
                decision: 'ask',
                reason: `${quoted} can destroy uncommitted work, and it runs ${where(finding.directory, worktrees())}.`,
            };
        case 'worktree-remove':
            return {
                decision: 'ask',
                reason: `${quoted} deletes a worktree and its uncommitted work outside the worktree directory.`,
            };
        case 'branch-delete': {
            const unmerged = unmergedBranches(finding);
            if (unmerged.length === 0) return undefined;
            return {
                decision: 'ask',
                reason: `${quoted} deletes ${unmerged.join(', ')}, which neither origin/main nor main contains.`,
            };
        }
        case 'ask':
            return { decision: 'ask', reason: `${quoted} ${finding.why}.` };
    }
}

function where(directory, worktrees) {
    if (directory === null) return 'in a directory the hook cannot work out';
    if (worktrees === null) return `in ${directory}`;
    return `in ${directory}, outside the worktree directory ${worktrees}`;
}

/**
 * The names in a `branch -D` that are not ancestors of `origin/main` or `main`. A name the hook
 * cannot read (a variable, input from `xargs`) counts as unmerged.
 */
function unmergedBranches({ names, remote, directory }) {
    return names
        .filter((name) => {
            if (name.expanded || directory === null) return true;
            const ref = `${remote ? 'refs/remotes' : 'refs/heads'}/${name.text}`;
            return !['refs/remotes/origin/main', 'refs/heads/main'].some((base) =>
                succeeds(['-C', directory, 'merge-base', '--is-ancestor', ref, base])
            );
        })
        .map((name) => name.text);
}

/**
 * The sibling `<main checkout>-worktrees` directory, found from the project directory's common
 * git directory, so it holds whether the session started in the main checkout or a worktree.
 */
function findWorktreesDirectory(input) {
    const projectDirectory = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
    try {
        const commonDirectory = execFileSync(
            'git',
            [
                '-C',
                projectDirectory,
                'rev-parse',
                '--path-format=absolute',
                '--git-common-dir',
            ],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
        ).trim();
        const mainCheckout = dirname(commonDirectory);
        return join(dirname(mainCheckout), `${basename(mainCheckout)}-worktrees`);
    } catch {
        return null;
    }
}

/**
 * Claude Code's per-user temporary directory, `<tmp>/claude-<uid>`, as a real path; `null` where
 * there is no uid (Windows).
 */
function findClaudeTemporaryRoot() {
    if (typeof process.getuid !== 'function') return null;
    const base = process.env.CLAUDE_CODE_TMPDIR || '/tmp';
    return canonical(join(base, `claude-${process.getuid()}`));
}

/** Whether a path is a session's scratchpad, `<root>/<project>/<session>/scratchpad`, or below it. */
function isInScratchpad(path, claudeRoot) {
    if (path === null || claudeRoot === null) return false;
    const real = canonical(path);
    if (!real.startsWith(claudeRoot + sep)) return false;
    return real.slice(claudeRoot.length + 1).split(sep)[2] === 'scratchpad';
}

function isInside(path, directory) {
    if (path === null || directory === null) return false;
    return canonical(path).startsWith(canonical(directory) + sep);
}

/** Resolves symlinks (`/tmp` and `/private/tmp` on macOS) through the deepest part that exists. */
function canonical(path) {
    const missing = [];
    let current = resolve(path);
    for (;;) {
        try {
            return join(realpathSync(current), ...missing);
        } catch {
            const parent = dirname(current);
            if (parent === current) return resolve(path);
            missing.unshift(basename(current));
            current = parent;
        }
    }
}

function succeeds(args) {
    try {
        execFileSync('git', args, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function lazy(compute) {
    let value;
    let done = false;
    return () => {
        if (!done) {
            value = compute();
            done = true;
        }
        return value;
    };
}

/**
 * Walks parsed commands in order, tracking the directory each runs in (`null` when unknown), and
 * appends a finding for each guarded call.
 */
function collectFindings(items, startDirectory, findings) {
    let directory = startDirectory;
    let previousSeparator = ';';
    const stack = [];
    for (const item of items) {
        if (item.kind === 'open') {
            stack.push({
                directory,
                isFunction: item.isFunction,
                changesDirectory: false,
            });
            // A function body runs wherever the function is called.
            if (item.isFunction) directory = null;
            previousSeparator = ';';
            continue;
        }
        if (item.kind === 'close') {
            const scope = stack.pop();
            const unknown = scope.isFunction && scope.changesDirectory;
            directory = unknown ? null : scope.directory;
            continue;
        }
        for (const substitution of item.substitutions) {
            collectFindings(substitution, directory, findings);
        }
        const next = inspectCommand(item.words, directory, findings);
        if (next !== undefined) {
            // A `cd` in a pipeline runs in a subshell, and one followed by `||` or `&` may not
            // have happened by the time the next command runs.
            const certain =
                previousSeparator !== '|' && !['|', '||', '&'].includes(item.separator);
            directory = certain ? next : null;
            for (const scope of stack) scope.changesDirectory = true;
        }
        previousSeparator = item.separator;
    }
}

const KEYWORDS = new Set([
    'if',
    'then',
    'else',
    'elif',
    'fi',
    'do',
    'done',
    'while',
    'until',
    '!',
    '{',
    '}',
]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

// Commands that run the command after them, with the options of each that take a value.
const WRAPPERS = new Map([
    ['env', new Set(['-u', '--unset', '-S', '--split-string'])],
    ['command', new Set()],
    ['builtin', new Set()],
    ['exec', new Set(['-a'])],
    ['nohup', new Set()],
    ['time', new Set(['-f', '-o'])],
    ['nice', new Set(['-n', '--adjustment'])],
    ['timeout', new Set(['-s', '--signal', '-k', '--kill-after'])],
    ['sudo', new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U'])],
    [
        'xargs',
        new Set([
            '-I',
            '-n',
            '-P',
            '-L',
            '-d',
            '-E',
            '-s',
            '-a',
            '--max-args',
            '--max-procs',
            '--delimiter',
            '--arg-file',
        ]),
    ],
]);

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);

// Stands for the arguments `xargs` appends, which the hook cannot know.
const INPUT_ARGUMENTS = { text: '<input>', expanded: true };

/** Inspects one simple command. Returns the new directory after `cd`, else `undefined`. */
function inspectCommand(words, directory, findings) {
    const args = unwrap(words);
    if (args === null || args.length === 0) return undefined;
    if (args.appendsArguments) args.push(INPUT_ARGUMENTS);
    const name = basename(args[0].text);
    const rest = args.slice(1);

    if (name === 'cd' || name === 'pushd') return changeDirectory(rest, directory);
    if (name === 'popd') return null;
    if (name === 'pkill' || name === 'killall') {
        findings.push({ kind: 'process-kill', label: name });
    } else if (name === 'git') {
        inspectGit(rest, directory, findings);
    } else if (name === 'wt') {
        inspectWorktrunk(rest, directory, findings);
    } else if (SHELLS.has(name)) {
        const script = shellScript(rest);
        if (script !== undefined)
            collectFindings(parseScript(script), directory, findings);
    } else if (name === 'eval') {
        const script = rest.map((word) => word.text).join(' ');
        collectFindings(parseScript(script), directory, findings);
    } else if (name === 'find') {
        inspectFindExec(rest, directory, findings);
    }
    return undefined;
}

/**
 * Drops keywords, assignments and wrapper commands (`env`, `sudo`, `xargs`…) from the front of a
 * command. Returns `null` for a command that runs nothing, such as `command -v`.
 */
function unwrap(words) {
    let rest = words;
    let appendsArguments = false;
    for (;;) {
        while (
            rest.length > 0 &&
            (KEYWORDS.has(rest[0].text) || ASSIGNMENT.test(rest[0].text))
        ) {
            rest = rest.slice(1);
        }
        if (rest.length === 0) return rest;
        const name = basename(rest[0].text);
        if (['for', 'case', 'select', 'function', 'esac'].includes(name)) return null;
        const valueOptions = WRAPPERS.get(name);
        if (valueOptions === undefined) break;
        let index = 1;
        while (
            index < rest.length &&
            rest[index].text.startsWith('-') &&
            rest[index].text !== '-'
        ) {
            const option = rest[index].text;
            if (name === 'command' && (option === '-v' || option === '-V')) return null;
            index += option === '--' ? 1 : valueOptions.has(option) ? 2 : 1;
            if (option === '--') break;
        }
        if (name === 'timeout') index += 1;
        if (name === 'xargs') appendsArguments = true;
        rest = rest.slice(index);
    }
    const result = [...rest];
    result.appendsArguments = appendsArguments;
    return result;
}

/** The script of `sh -c '<script>'`, or `undefined` when the shell runs a file or stdin. */
function shellScript(args) {
    let runsString = false;
    for (const word of args) {
        if (word.text.startsWith('-') || word.text.startsWith('+')) {
            if (/^-[a-zA-Z]*c/.test(word.text)) runsString = true;
            continue;
        }
        return runsString ? word.text : undefined;
    }
    return undefined;
}

function inspectFindExec(args, directory, findings) {
    for (let index = 0; index < args.length; index += 1) {
        const action = args[index].text;
        if (!['-exec', '-execdir', '-ok', '-okdir'].includes(action)) continue;
        const command = [];
        index += 1;
        while (
            index < args.length &&
            args[index].text !== ';' &&
            args[index].text !== '+'
        ) {
            command.push(args[index]);
            index += 1;
        }
        const runsIn = action === '-exec' || action === '-ok' ? directory : null;
        inspectCommand(command, runsIn, findings);
    }
}

function changeDirectory(args, directory) {
    const operands = args.filter(
        (word) => !/^-[LPe@]+$/.test(word.text) && word.text !== '--'
    );
    if (operands.length === 0) return homedir();
    if (operands[0].text === '-') return null;
    return resolvePath(operands[0], directory);
}

/** Resolves a path word against a directory; `null` when either is unknown. */
function resolvePath(word, directory) {
    let text = word.text;
    if (text === '~' || text.startsWith('~/')) text = homedir() + text.slice(1);
    if (word.expanded) {
        text = text.replace(/^(\$HOME|\$\{HOME\})(?=\/|$)/, homedir());
        if (/[$`]/.test(text) || word === INPUT_ARGUMENTS) return null;
    }
    if (isAbsolute(text)) return resolve(text);
    return directory === null ? null : resolve(directory, text);
}

// Global options of git that take their value as the next word.
const GIT_VALUE_OPTIONS = new Set([
    '-c',
    '--namespace',
    '--config-env',
    '--super-prefix',
]);

/** Appends a finding for a git call that can destroy work, or that the hook refuses. */
function inspectGit(args, startDirectory, findings) {
    let directory = startDirectory;
    let index = 0;
    while (index < args.length && args[index].text.startsWith('-')) {
        const option = args[index].text;
        if (option === '-C' || option === '--work-tree') {
            const target = args[index + 1];
            if (target === undefined) return;
            directory = resolvePath(target, directory);
            index += 2;
        } else if (option === '--git-dir') {
            directory = null;
            index += 2;
        } else if (option.startsWith('--work-tree=')) {
            const target = { ...args[index], text: option.slice('--work-tree='.length) };
            directory = resolvePath(target, directory);
            index += 1;
        } else {
            if (option.startsWith('--git-dir=')) directory = null;
            index += GIT_VALUE_OPTIONS.has(option) ? 2 : 1;
        }
    }
    if (index >= args.length) return;

    const subcommand = args[index].text;
    const rest = args.slice(index + 1);
    const texts = rest.map((word) => word.text);
    const shortFlags = new Set(
        texts
            .filter((text) => /^-[a-zA-Z]+$/.test(text))
            .flatMap((text) => [...text.slice(1)])
    );
    const label = truncate(['git', subcommand, ...texts].join(' '));
    const workingTree = () => findings.push({ kind: 'working-tree', label, directory });

    switch (subcommand) {
        case 'reset':
            if (texts.some((text) => ['--hard', '--merge', '--keep'].includes(text)))
                workingTree();
            return;
        case 'clean':
            if (shortFlags.has('f') || texts.includes('--force')) workingTree();
            return;
        case 'checkout': {
            const separator = texts.indexOf('--');
            const beforeSeparator = separator === -1 ? texts : texts.slice(0, separator);
            const paths = separator === -1 ? [] : texts.slice(separator + 1);
            const forced = shortFlags.has('f') || texts.includes('--force');
            if (forced || beforeSeparator.includes('.') || paths.length > 0)
                workingTree();
            return;
        }
        case 'restore': {
            const staged = shortFlags.has('S') || texts.includes('--staged');
            const worktree = shortFlags.has('W') || texts.includes('--worktree');
            if (!staged || worktree) workingTree();
            return;
        }
        case 'stash': {
            const action = stashAction(texts);
            if (action === 'drop' || action === 'clear') {
                findings.push({
                    kind: 'ask',
                    label,
                    directory,
                    why: 'deletes stash entries, which every worktree of the repository shares',
                });
            } else if (action === 'push' || action === 'save') {
                findings.push({ kind: 'stash', label, directory });
            }
            return;
        }
        case 'branch': {
            const deleting = shortFlags.has('d') || texts.includes('--delete');
            const forcing = shortFlags.has('f') || texts.includes('--force');
            if (!shortFlags.has('D') && !(deleting && forcing)) return;
            findings.push({
                kind: 'branch-delete',
                label,
                directory,
                remote: shortFlags.has('r') || texts.includes('--remotes'),
                names: rest.filter((word) => !word.text.startsWith('-')),
            });
            return;
        }
        case 'push': {
            const forced =
                shortFlags.has('f') ||
                texts.some(
                    (text) =>
                        text === '--force' ||
                        text.startsWith('--force-with-lease') ||
                        text.startsWith('+')
                );
            if (forced) findings.push({ kind: 'force-push', label });
            return;
        }
        case 'worktree': {
            if (texts[0] !== 'remove') return;
            const removeArgs = rest.slice(1);
            const forced = removeArgs.some(
                (word) => word.text === '--force' || /^-[a-zA-Z]*f/.test(word.text)
            );
            if (!forced) return;
            const target = removeArgs.find((word) => !word.text.startsWith('-'));
            findings.push({
                kind: 'worktree-remove',
                label,
                directory,
                target: target === undefined ? null : resolvePath(target, directory),
            });
            return;
        }
    }
}

// Options of `wt` and its subcommands that take their value as the next word.
const WT_VALUE_OPTIONS = new Set([
    '-C',
    '--config',
    '--config-set',
    '--format',
    '-x',
    '--execute',
    '-b',
    '--base',
]);

// `wt step` commands that commit, rewrite or push history, or delete worktrees and branches.
const WT_REFUSED_STEPS = new Set([
    'commit',
    'squash',
    'push',
    'rebase',
    'promote',
    'relocate',
    'prune',
]);

/** Appends a finding for a Worktrunk call that rewrites history or can destroy work. */
function inspectWorktrunk(args, startDirectory, findings) {
    let directory = startDirectory;
    const operands = [];
    const flags = new Set();
    for (let index = 0; index < args.length; index += 1) {
        const word = args[index];
        if (word.text === '--') break;
        if (WT_VALUE_OPTIONS.has(word.text)) {
            if (word.text === '-C') {
                const target = args[index + 1];
                directory = target === undefined ? null : resolvePath(target, directory);
            }
            index += 1;
        } else if (word.text.startsWith('--')) {
            flags.add(word.text.split('=')[0]);
        } else if (/^-[a-zA-Z]+$/.test(word.text)) {
            for (const letter of word.text.slice(1)) flags.add(`-${letter}`);
        } else {
            operands.push(word);
        }
    }
    const [subcommand, ...rest] = operands.map((word) => word.text);
    const label = truncate(['wt', ...args.map((word) => word.text)].join(' '));

    if (subcommand === 'merge') {
        findings.push({
            kind: 'refused',
            label,
            why: 'branches land with `pnpm run land`, which merges onto the fetched origin/main and pushes (AGENTS.md, "Branches and worktrees")',
        });
    } else if (subcommand === 'step' && WT_REFUSED_STEPS.has(rest[0])) {
        findings.push({
            kind: 'refused',
            label,
            why: 'it commits, rewrites or pushes history, or deletes worktrees and branches. Commit with git, and land with `pnpm run land`',
        });
    } else if (subcommand === 'remove') {
        if (flags.has('-D') || flags.has('--force-delete')) {
            findings.push({
                kind: 'ask',
                label,
                directory,
                why: 'deletes branches even when no other branch contains their commits',
            });
        }
        if (flags.has('-f') || flags.has('--force')) {
            const targets = operands.slice(1);
            if (targets.length === 0) {
                findings.push({
                    kind: 'worktree-remove',
                    label,
                    directory,
                    target: directory,
                });
            }
            for (const target of targets) {
                findings.push({
                    kind: 'worktree-remove',
                    label,
                    directory,
                    target: worktreeOf(target, directory),
                });
            }
        }
    } else if (subcommand === 'switch' && flags.has('--clobber')) {
        findings.push({
            kind: 'ask',
            label,
            directory,
            why: 'deletes whatever directory is at the new worktree path',
        });
    } else if (subcommand === 'config' && rest[0] === 'state' && rest[1] === 'clear') {
        findings.push({
            kind: 'ask',
            label,
            directory,
            why: "clears Worktrunk's stored state for the repository, which every worktree shares",
        });
    }
}

/**
 * The path of the worktree a `wt remove` operand names: the worktree of that branch, else the
 * operand read as a path. `null` when the hook cannot tell.
 */
function worktreeOf(word, directory) {
    if (word.expanded || directory === null) return null;
    let listing;
    try {
        listing = execFileSync(
            'git',
            ['-C', directory, 'worktree', 'list', '--porcelain'],
            {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            }
        );
    } catch {
        return null;
    }
    for (const entry of listing.split('\n\n')) {
        const path = /^worktree (.+)$/m.exec(entry)?.[1];
        const branch = /^branch refs\/heads\/(.+)$/m.exec(entry)?.[1];
        if (path !== undefined && branch === word.text) return path;
    }
    return resolvePath(word, directory);
}

/** The stash subcommand: the first operand, skipping `-m <message>`; a bare stash is `push`. */
function stashAction(texts) {
    for (let index = 0; index < texts.length; index += 1) {
        const text = texts[index];
        if (text === '--') return 'push';
        if (text === '-m' || text === '--message') {
            index += 1;
            continue;
        }
        if (!text.startsWith('-')) return text;
    }
    return 'push';
}

function truncate(text) {
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

class ParseError extends Error {}

/**
 * Parses shell source into items: `{ kind: 'command', words, substitutions, separator }`, and an
 * `open` and `close` around a subshell or a function body (`open` has `isFunction`). A `{ }`
 * group is not a scope: its commands stay in the list, with `{` and `}` as words. A word is
 * `{ text, expanded }`, where `text` has its quotes removed and `expanded` says it holds a `$` or
 * backtick expansion the hook cannot evaluate.
 */
function parseScript(source) {
    return new Parser(source).parseList(false);
}

class Parser {
    constructor(source) {
        this.source = source;
        this.index = 0;
        this.heredocs = [];
    }

    peek(offset = 0) {
        return this.source[this.index + offset];
    }

    startsWith(text) {
        return this.source.startsWith(text, this.index);
    }

    /** Parses commands up to the end, or up to the `)` that closes a `$(` when `inSubstitution`. */
    parseList(inSubstitution) {
        const items = [];
        let words = [];
        let substitutions = [];
        let lastWordEnd = -1;
        let depth = 0;
        // One entry per open `{`: 'function' for a function body, else 'group'.
        const braces = [];
        // Set after a function's name and `()`, until its body opens.
        let functionPending = false;
        const checkClosed = () => {
            if (braces.includes('function'))
                throw new ParseError('unclosed function body');
            if (functionPending) throw new ParseError('function without a body');
        };
        const finish = (separator) => {
            if (words.length > 0 || substitutions.length > 0) {
                items.push({ kind: 'command', words, substitutions, separator });
            }
            words = [];
            substitutions = [];
        };

        while (this.index < this.source.length) {
            const char = this.peek();
            if (char === ' ' || char === '\t') {
                this.index += 1;
            } else if (char === '\\' && this.peek(1) === '\n') {
                this.index += 2;
            } else if (char === '\n') {
                this.index += 1;
                finish(';');
                this.skipHeredocBodies();
            } else if (char === '#') {
                const end = this.source.indexOf('\n', this.index);
                this.index = end === -1 ? this.source.length : end;
            } else if (char === ';') {
                this.index += this.startsWith(';;') ? 2 : 1;
                finish(';');
            } else if (this.startsWith('&&') || this.startsWith('||')) {
                finish(this.source.slice(this.index, this.index + 2));
                this.index += 2;
            } else if (this.startsWith('&>')) {
                this.index += this.startsWith('&>>') ? 3 : 2;
                this.readRedirectionTarget();
            } else if (char === '&') {
                this.index += 1;
                finish('&');
            } else if (char === '|') {
                this.index += this.startsWith('|&') ? 2 : 1;
                finish('|');
            } else if (char === '(') {
                if (words.length > 0) {
                    // `name()` starts a function definition; nothing else puts a word before `(`.
                    const [name] = words;
                    const definesFunction =
                        words.length === 1 &&
                        !name.expanded &&
                        !name.text.includes('=') &&
                        this.skipEmptyParentheses();
                    if (!definesFunction) throw new ParseError('unexpected "("');
                    words = [];
                    functionPending = true;
                    continue;
                }
                this.index += 1;
                items.push({ kind: 'open', isFunction: functionPending });
                functionPending = false;
                depth += 1;
            } else if (char === ')') {
                this.index += 1;
                finish(')');
                if (depth === 0) {
                    if (inSubstitution) {
                        checkClosed();
                        return items;
                    }
                    throw new ParseError('unmatched ")"');
                }
                depth -= 1;
                items.push({ kind: 'close' });
            } else if (char === '<' || char === '>') {
                // A file descriptor written against the operator, as in `2>&1`, is not a word.
                const last = words.at(-1);
                if (
                    lastWordEnd === this.index &&
                    last !== undefined &&
                    /^\d+$/.test(last.text)
                ) {
                    words.pop();
                }
                this.readRedirection();
            } else {
                const word = this.readWord(substitutions);
                lastWordEnd = this.index;
                // `{` and `}` are reserved words only where a command can start.
                const commandStart = words.every((each) => KEYWORDS.has(each.text));
                if (functionPending && !(commandStart && word.text === '{')) {
                    throw new ParseError(
                        'function body is not a { } group or ( ) subshell'
                    );
                }
                if (commandStart && word.text === '{') {
                    braces.push(functionPending ? 'function' : 'group');
                    if (functionPending) {
                        items.push({ kind: 'open', isFunction: true });
                        functionPending = false;
                        continue;
                    }
                } else if (
                    commandStart &&
                    word.text === '}' &&
                    braces.at(-1) === 'function'
                ) {
                    braces.pop();
                    finish(';');
                    items.push({ kind: 'close' });
                    continue;
                } else if (commandStart && word.text === '}') {
                    braces.pop();
                } else if (words.length === 1 && words[0].text === 'function') {
                    // `function name`, with or without `()`.
                    this.skipEmptyParentheses();
                    words = [];
                    functionPending = true;
                    continue;
                }
                words.push(word);
            }
        }
        if (inSubstitution) throw new ParseError('unclosed "$("');
        if (depth !== 0) throw new ParseError('unclosed "("');
        checkClosed();
        finish('end');
        return items;
    }

    /** Skips a `()` at the cursor, with any blanks before or inside it; says whether there was one. */
    skipEmptyParentheses() {
        const match = /^[ \t]*\([ \t]*\)/.exec(this.source.slice(this.index));
        if (match === null) return false;
        this.index += match[0].length;
        return true;
    }

    readRedirection() {
        if (this.startsWith('<<<')) {
            this.index += 3;
            this.readRedirectionTarget();
        } else if (this.startsWith('<<')) {
            const stripTabs = this.startsWith('<<-');
            this.index += stripTabs ? 3 : 2;
            const delimiter = this.readRedirectionTarget();
            this.heredocs.push({ delimiter: delimiter.text, stripTabs });
        } else {
            const operator = /^(>>|>\||>&|<&|<>|>|<)/.exec(
                this.source.slice(this.index)
            )[0];
            this.index += operator.length;
            this.readRedirectionTarget();
        }
    }

    readRedirectionTarget() {
        while (this.peek() === ' ' || this.peek() === '\t') this.index += 1;
        const start = this.index;
        const word = this.readWord([]);
        if (this.index === start) throw new ParseError('redirection without a target');
        return word;
    }

    /** Skips the bodies of the heredocs opened on the line just ended. */
    skipHeredocBodies() {
        for (const { delimiter, stripTabs } of this.heredocs) {
            while (this.index < this.source.length) {
                let end = this.source.indexOf('\n', this.index);
                if (end === -1) end = this.source.length;
                let line = this.source.slice(this.index, end);
                this.index = Math.min(end + 1, this.source.length);
                if (stripTabs) line = line.replace(/^\t+/, '');
                if (line === delimiter) break;
            }
        }
        this.heredocs = [];
    }

    readWord(substitutions) {
        let text = '';
        let expanded = false;
        while (this.index < this.source.length) {
            const char = this.peek();
            if (' \t\n;&|()<>'.includes(char)) break;
            if (char === '\\') {
                const next = this.peek(1);
                if (next === undefined) throw new ParseError('trailing backslash');
                if (next !== '\n') text += next;
                this.index += 2;
            } else if (char === "'") {
                const end = this.source.indexOf("'", this.index + 1);
                if (end === -1) throw new ParseError('unclosed single quote');
                text += this.source.slice(this.index + 1, end);
                this.index = end + 1;
            } else if (char === '"') {
                const part = this.readDoubleQuoted(substitutions);
                text += part.text;
                expanded ||= part.expanded;
            } else if (char === '$') {
                const part = this.readDollar(substitutions);
                text += part.text;
                expanded ||= part.expanded;
            } else if (char === '`') {
                text += this.readBackticks(substitutions);
                expanded = true;
            } else {
                text += char;
                this.index += 1;
            }
        }
        return { text, expanded };
    }

    readDoubleQuoted(substitutions) {
        this.index += 1;
        let text = '';
        let expanded = false;
        for (;;) {
            const char = this.peek();
            if (char === undefined) throw new ParseError('unclosed double quote');
            if (char === '"') {
                this.index += 1;
                return { text, expanded };
            }
            if (char === '\\' && '$`"\\\n'.includes(this.peek(1) ?? '')) {
                if (this.peek(1) !== '\n') text += this.peek(1);
                this.index += 2;
            } else if (char === '$' && this.peek(1) !== "'") {
                const part = this.readDollar(substitutions);
                text += part.text;
                expanded ||= part.expanded;
            } else if (char === '`') {
                text += this.readBackticks(substitutions);
                expanded = true;
            } else {
                text += char;
                this.index += 1;
            }
        }
    }

    /** Reads an expansion starting at `$`; a command substitution is parsed into `substitutions`. */
    readDollar(substitutions) {
        const start = this.index;
        if (this.startsWith('$((')) {
            this.index += 3;
            let depth = 2;
            while (depth > 0) {
                const char = this.peek();
                if (char === undefined) throw new ParseError('unclosed "$(("');
                if (char === '(') depth += 1;
                if (char === ')') depth -= 1;
                this.index += 1;
            }
            return { text: this.source.slice(start, this.index), expanded: true };
        }
        if (this.startsWith('$(')) {
            this.index += 2;
            substitutions.push(this.parseList(true));
            return { text: '$(...)', expanded: true };
        }
        if (this.startsWith('${')) {
            const end = this.source.indexOf('}', this.index);
            if (end === -1) throw new ParseError('unclosed "${"');
            this.index = end + 1;
            return { text: this.source.slice(start, this.index), expanded: true };
        }
        if (this.startsWith("$'")) {
            const match = /^\$'((?:[^'\\]|\\.)*)'/s.exec(this.source.slice(this.index));
            if (match === null) throw new ParseError('unclosed "$\'"');
            this.index += match[0].length;
            return { text: match[1], expanded: false };
        }
        const name = /^\$([A-Za-z_][A-Za-z0-9_]*|[0-9#?$!*@-])/.exec(
            this.source.slice(this.index)
        );
        if (name === null) {
            this.index += 1;
            return { text: '$', expanded: false };
        }
        this.index += name[0].length;
        return { text: name[0], expanded: true };
    }

    readBackticks(substitutions) {
        this.index += 1;
        let inner = '';
        for (;;) {
            const char = this.peek();
            if (char === undefined) throw new ParseError('unclosed backtick');
            this.index += 1;
            if (char === '`') break;
            if (char === '\\' && '$`\\'.includes(this.peek() ?? '')) {
                inner += this.peek();
                this.index += 1;
            } else {
                inner += char;
            }
        }
        substitutions.push(parseScript(inner));
        return '`...`';
    }
}

main();
