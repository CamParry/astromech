/**
 * Fails when a markdown link or backticked path in the docs, `eslint.config.js` or a package's doc
 * comments no longer resolves, or a source comment carries a history marker. A path resolves only
 * if git tracks it, so a local-only file cannot hide a broken reference.
 *
 *     pnpm run check:docs
 *
 * `check:docs` runs this, then `docs-index.ts --check`. The pre-commit hook runs both.
 *
 * Exit codes: 0 when every reference resolves, 1 when one does not, 2 on a usage error.
 */
import console from 'node:console';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { capture } from './lib/run.ts';

const NAME = 'check:docs';
const USAGE = 'usage: pnpm run check:docs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A reference that does not resolve: the file it is in, as written, and what it names. */
type Failure = { file: string; raw: string; target: string };

/**
 * Whether the arguments are valid: there are none. pnpm passes a `--` on to
 * the script, so every `--` is dropped.
 */
function parseArguments(): boolean {
    try {
        parseArgs({
            args: process.argv.slice(2).filter((arg) => arg !== '--'),
            strict: true,
            options: {},
        });
        return true;
    } catch (error) {
        console.error(`${(error as Error).message}\n${USAGE}`);
        return false;
    }
}

const { trackedFiles, trackedDirs } = readTrackedPaths();

const SKIP_DIRS = new Set([
    'node_modules',
    'dist',
    '.git',
    '.astro',
    '.tanstack',
    'worktrees',
    'coverage',
    'build',
]);

// Trees whose backticked paths are not checked, for two different reasons.
//
// Planned work and in-flight designs name files that do not exist yet, so a
// path there is a proposal rather than a claim. Frozen records quote paths that
// were accurate when written, so a later rename must not fail them — that would
// tax a historical document for an unrelated change, and the fix would be to
// falsify the record.
//
// Markdown LINKS are checked in all of them, because a link is a promise the
// reader can click, and a roadmap file linking to a sibling that has since moved
// to `completed/` is exactly the rot worth catching.
const PATHS_UNCHECKED_TREES = [
    join('specs', ''),
    join('roadmap', 'proposed', ''),
    join('roadmap', 'planned', ''),
    join('roadmap', 'completed', ''),
];

// Build output — present after a build, absent in a clean checkout.
const GENERATED = ['/.astro/', '/dist/', '/.tanstack/'];

// A backticked token is only checked when its first segment names something
// that actually exists, which keeps package subpaths (`astromech/ui`) and
// loose source references (`src/database/schema`) out of the results.
const PATH_EXTENSIONS = new Set([
    '.md',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
    '.css',
    '.sh',
    '.astro',
    '.yml',
    '.yaml',
]);

// A source comment names a path relative to its own directory, its package or
// its package's `src`, and markdown names core's modules from `src` down
// (`content/resources.ts`), so each package's root and `src` are bases too.
const PACKAGE_ROOTS = [...trackedFiles]
    .filter((file) => /^packages\/(plugins\/)?[^/]+\/package\.json$/.test(file))
    .map((file) => resolve(repoRoot, dirname(file)));
const PACKAGE_SRC_DIRS = PACKAGE_ROOTS.map((root) => join(root, 'src'));

// The comments that are checked: every comment in the lint config, and the doc
// comments of the packages' sources.
const LINT_CONFIG = 'eslint.config.js';
const SOURCE_FILE = /^packages\/(plugins\/)?[^/]+\/src\/.*\.tsx?$/;

// A module path in a comment may leave off its extension, as an import does.
const MODULE_SUFFIXES = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts'];

// Words that date a comment: a plan's phase or step numbers, a spec section,
// and the state of the code before a change. The reasoning belongs in
// DECISIONS.md and the history in git.
const HISTORY_MARKERS = [
    /\bPhase \d/,
    /(^|[^\w/])P\d+\//,
    /\bspec §/,
    /\bpre-extraction\b/,
];

if (!parseArguments()) {
    process.exitCode = 2;
} else {
    process.exitCode = check();
}

/** Runs the check, and returns its exit code. */
function check(): number {
    const failures: Failure[] = [];

    for (const file of markdownFiles(repoRoot)) {
        const local = relative(repoRoot, file);

        const source = readFileSync(file, 'utf8');
        const body = withoutFencedBlocks(source);

        for (const { target, raw } of markdownLinks(body)) {
            if (!resolvesIn([dirname(file), repoRoot], target)) {
                failures.push({ file, raw, target });
            }
        }

        if (PATHS_UNCHECKED_TREES.some((tree) => local.startsWith(tree))) continue;

        // User docs name files in the reader's own project, not in this repo's packages.
        const bases = local.startsWith(join('apps', 'docs', ''))
            ? [dirname(file), repoRoot]
            : [dirname(file), repoRoot, ...ownPackageBases(file), ...PACKAGE_SRC_DIRS];
        for (const token of backtickedPaths(body)) {
            if (!isPathCandidate(bases, token)) continue;
            if (!resolvesIn(bases, token)) {
                failures.push({ file, raw: `\`${token}\``, target: token });
            }
        }
    }

    for (const local of trackedFiles) {
        const isLintConfig = local === LINT_CONFIG;
        if (!isLintConfig && !SOURCE_FILE.test(local)) continue;
        const file = resolve(repoRoot, local);
        const source = readFileSync(file, 'utf8');
        const bases = [
            dirname(file),
            repoRoot,
            ...ownPackageBases(file),
            ...PACKAGE_SRC_DIRS,
        ];

        const checked = isLintConfig ? allComments(source) : docComments(source);
        for (const token of backtickedPaths(checked.join('\n'))) {
            if (!isSourcePathCandidate(bases, token)) continue;
            if (!resolvesIn(bases, token)) {
                failures.push({ file, raw: `\`${token}\``, target: token });
            }
        }

        for (const comment of allComments(source)) {
            for (const marker of HISTORY_MARKERS) {
                const match = comment.match(marker);
                if (match) {
                    failures.push({
                        file,
                        raw: `history marker "${match[0].trim()}"`,
                        target: 'a comment says what the code does now',
                    });
                }
            }
        }
    }

    if (failures.length > 0) {
        console.error(`FAIL ${NAME}: ${failures.length} problem(s):\n`);
        for (const { file, raw, target } of failures) {
            console.error(`  ${relative(repoRoot, file)}\n    ${raw} → ${target}`);
        }
        console.error('\nFix the reference, or the thing it points at.');
        return 1;
    }

    console.log(`ok   ${NAME}: every reference in markdown and source comments resolves`);
    return 0;
}

function* markdownFiles(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            yield* markdownFiles(join(dir, entry.name));
        } else if (entry.name.endsWith('.md')) {
            yield join(dir, entry.name);
        }
    }
}

// Fenced code blocks hold illustrative paths and directory trees that are not
// expected to resolve, so they never reach the checks.
function withoutFencedBlocks(source: string): string {
    return source.replace(/^```[\s\S]*?^```/gm, '');
}

function* markdownLinks(body: string): Generator<{ target: string; raw: string }> {
    for (const match of body.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
        const target = stripAnchor(match[1] ?? '');
        if (!target) continue;
        if (/^(https?:|mailto:|#|\/)/.test(target)) continue;
        yield { target, raw: match[0] };
    }
}

function* backtickedPaths(body: string): Generator<string> {
    const seen = new Set<string>();
    for (const match of body.matchAll(/`([^`\n]+)`/g)) {
        const token = stripAnchor((match[1] ?? '').trim().replace(/[.,;:]+$/, ''));
        if (!token || seen.has(token)) continue;
        seen.add(token);
        yield token;
    }
}

function stripAnchor(value: string): string {
    return (value.split('#')[0] ?? '').trim();
}

/** The `/** … *\/` blocks of a source file. */
function docComments(source: string): string[] {
    return source.match(/\/\*\*[\s\S]*?\*\//g) ?? [];
}

/** Every block and line comment. A `//` inside a string or URL is skipped by the leading-space rule. */
function allComments(source: string): string[] {
    const blocks = source.match(/\/\*[\s\S]*?\*\//g) ?? [];
    const lines = [...source.matchAll(/(?:^|\s)(\/\/[^\n]*)/g)].map(
        (match) => match[1] ?? ''
    );
    return [...blocks, ...lines];
}

/** A `./` or `../` path is relative to the file itself (the first base), and nothing else. */
function basesFor(bases: string[], token: string): string[] {
    return token.startsWith('./') || token.startsWith('../') ? bases.slice(0, 1) : bases;
}

/** The root and `src` of the package a file sits in, if any. */
function ownPackageBases(file: string): string[] {
    const root = PACKAGE_ROOTS.find((dir) => file.startsWith(dir + sep));
    return root === undefined ? [] : [root, join(root, 'src')];
}

// A source comment names many things that are not repo paths (package
// subpaths, MIME types, URL routes, example layouts), so only a token with a
// slash whose first segment exists under one of the bases is checked.
function isSourcePathCandidate(bases: string[], token: string): boolean {
    if (!token.includes('/')) return false;
    return isPathCandidate(bases, token);
}

function isPathCandidate(allBases: string[], token: string): boolean {
    if (/[\s*<>(){}|?=,'"$!]/.test(token)) return false;
    if (/^(https?:|mailto:|@|#|\/|~)/.test(token)) return false;
    if (token.includes(':')) return false;
    if (GENERATED.some((segment) => `/${token}`.includes(segment))) return false;
    if (token.startsWith('.') && !token.startsWith('./') && !token.startsWith('../'))
        return false;
    if (!token.includes('/') && !PATH_EXTENSIONS.has(extname(token))) return false;

    const [head] = token.replace(/^\.\//, '').split('/');
    if (!head) return false;
    return basesFor(allBases, token).some((base) => isTracked(resolve(base, head)));
}

function resolvesIn(allBases: string[], target: string): boolean {
    const bases = basesFor(allBases, target);
    const clean = target.replace(/\/$/, '');
    const suffixes = extname(clean) === '' ? MODULE_SUFFIXES : [''];
    return bases.some((base) =>
        suffixes.some((suffix) => isTracked(resolve(base, clean + suffix)))
    );
}

// Every path in the git index, which includes files staged but not yet committed,
// so the pre-commit hook sees the files a commit adds. A directory counts when it
// holds at least one tracked file.
function readTrackedPaths(): { trackedFiles: Set<string>; trackedDirs: Set<string> } {
    const output = capture('git', ['ls-files', '-z'], { cwd: repoRoot });
    const files = new Set(output.split('\0').filter(Boolean));
    const dirs = new Set<string>();
    for (const file of files) {
        const segments = file.split('/');
        for (let end = 1; end < segments.length; end++) {
            dirs.add(segments.slice(0, end).join('/'));
        }
    }
    return { trackedFiles: files, trackedDirs: dirs };
}

function isTracked(absolute: string): boolean {
    const local = relative(repoRoot, absolute).split(sep).join('/');
    if (local === '') return true;
    if (local === '..' || local.startsWith('../')) return false;
    return trackedFiles.has(local) || trackedDirs.has(local);
}
