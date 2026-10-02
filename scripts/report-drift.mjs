#!/usr/bin/env node
/**
 * Prints where a branch adds a known drift pattern or a copy of existing code, and where it
 * weakens the tests, for a person to read at review. It compares the merge base of `--base`
 * (default `main`) and HEAD against the working tree, so committed and uncommitted changes both
 * count. It reads three kinds of file under `packages/` and `apps/`: source files under a
 * package's `src`, test files (anything under a `tests` directory or named `*.test.*`), and
 * `vitest.config.*` files, whose coverage thresholds it compares with the merge base's.
 *
 * It never fails on what it finds: it exits 0 whatever the report says, and non-zero only on bad
 * arguments or its own crash. `--no-copies` skips the jscpd scan.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// The core container and layout field types (`fields/core-field-types.ts`).
// Code outside the fields directories that branches on one of them usually
// wants the field type's own members, or `isLayoutField`/`fieldAffectsData`.
const STRUCTURAL_TYPES = 'group|accordion|tabs|tab|repeater|blocks|tree';

/**
 * Each entry: `name`, `pattern` (tested per line), `files` (`'source'`, the default, or
 * `'tests'`), `lines` (`'added'`, the default, to list lines the branch adds, or `'removed'` to
 * list lines it removes), `only` / `except` (path prefixes from the repo root, or regular
 * expressions over that path) and `why` (printed under the name). Add a pattern by adding a line.
 */
const PATTERNS = [
    {
        name: '`as unknown as` cast',
        pattern: /\bas unknown as\b/,
        why: 'A cast hides a type the code could state.',
    },
    {
        name: 'Inline query key',
        // `queryKey: [` inline, or a key array held in a variable first.
        pattern: /\bqueryKey:\s*\[|\b\w+Key\s*=\s*\[\s*['"]/,
        except: ['packages/admin/src/hooks/use-query-keys.ts'],
        why: "Admin query keys come from the factory in hooks/use-query-keys.ts; a plugin page's sit under ['plugin', name].",
    },
    {
        name: 'Field `.type` compared with a structural type',
        pattern: new RegExp(
            `\\.type\\s*[!=]==\\s*['"](${STRUCTURAL_TYPES})['"]|['"](${STRUCTURAL_TYPES})['"]\\s*[!=]==\\s*[\\w.?]+\\.type\\b`
        ),
        except: [
            'packages/astromech/src/fields/',
            'packages/admin/src/components/fields/',
        ],
        why: 'Container and layout rules live in the fields directories; branch through their helpers.',
    },
    {
        name: 'Comment says code mirrors another module',
        pattern: /^\s*(\/\/|\/?\*).*\b(mirror|mirrors|mirroring|copied from)\b/i,
        why: 'A mirrored copy drifts from its source; share it or say why it differs.',
    },
    {
        name: 'New NotFound or Validation error class',
        pattern: /\bclass\s+\w+(NotFoundError|ValidationError)\b/,
        why: 'Errors of these kinds already exist; check the shared ones first.',
    },
    {
        name: 'Repository built outside a repository file',
        pattern: /\bcreate\w*Repository\(/,
        // A plugin builds its repository per call from `ctx.db` (DECISIONS.md).
        except: [/\/repository(\.ts$|\/)/, 'packages/plugins/'],
        why: 'A service reaches a repository through its getXRepository() registry accessor; only repository files build one.',
    },
    {
        name: '`collection` as an identifier',
        pattern: /(?<![\w'"`/.-])[cC]ollection\w*\b(?![-'"`])|[a-z0-9]Collection/,
        why: 'TERMINOLOGY.md calls this an entry type.',
    },
    {
        name: 'Removed `expect` call',
        // `expect(`, `expect.soft(` and the like; not `expectTypeOf(`, which tsc checks.
        pattern: /\bexpect(\.\w+)?\(/,
        files: 'tests',
        lines: 'removed',
        why: 'A removed assertion checks nothing; say which behaviour no longer needs it.',
    },
    {
        name: 'New `.skip`, `.only` or `.todo`',
        pattern:
            /\b(it|test|describe|suite)(\.(concurrent|sequential|each|for|fails))*\.(skip|only|todo|skipIf|runIf)\b/,
        files: 'tests',
        why: 'A skipped test passes whatever the code does, and `.only` narrows the run.',
    },
    {
        name: 'New `vi.mock`',
        pattern: /\bvi\.(mock|doMock)\(/,
        files: 'tests',
        why: 'Use the real module or a driver seam where one exists (the `testing` skill).',
    },
];

// The four metrics a vitest coverage threshold entry sets.
const THRESHOLD_METRIC = /\b(lines|functions|branches|statements)\s*:\s*(\d+(?:\.\d+)?)/g;

/** The files the report reads, as paths from the repo root. */
const SOURCE_FILE =
    /^(packages\/plugins\/[^/]+|packages\/[^/]+|apps\/[^/]+)\/src\/.+\.(ts|tsx|mjs|js)$/;
const TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)(-d)?\.[cm]?[jt]sx?$/;
const CODE_FILE = /\.[cm]?[jt]sx?$/;
const VITEST_CONFIG = /(^|\/)vitest\.config\.[cm]?[jt]s$/;

// jscpd's defaults. With import statements ignored (below), every clone they
// found on real branch ranges was a real copy, and the scan of the whole repo
// takes under a second.
const COPY_MIN_LINES = 5;
const COPY_MIN_TOKENS = 50;

const args = parseArgs(process.argv.slice(2));
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
}).trim();
const mergeBase = resolveMergeBase(args.base);
const files = readChanges(mergeBase);

const lines = [
    `Drift report: ${args.base} (merge base ${mergeBase.slice(0, 8)}) to the working tree`,
];
const patternSection = reportPatterns(files);
const thresholdSection = reportThresholds(
    files.filter(({ kind }) => kind === 'vitest-config'),
    mergeBase
);
const copySection = args.copies
    ? await reportCopies(files.filter(({ kind }) => kind === 'source'))
    : [];

if (
    patternSection.length === 0 &&
    thresholdSection.length === 0 &&
    copySection.length === 0
) {
    lines.push('', args.copies ? 'Nothing found.' : 'Nothing found (copies skipped).');
} else {
    lines.push('', 'Patterns', '');
    lines.push(...(patternSection.length > 0 ? patternSection : ['  none']));
    lines.push('', 'Lowered coverage thresholds', '');
    lines.push(...(thresholdSection.length > 0 ? thresholdSection : ['  none']));
    if (args.copies) {
        lines.push('', 'Copies', '');
        lines.push(...(copySection.length > 0 ? copySection : ['  none']));
    }
    lines.push(
        '',
        'For each item: share it now, add it to a roadmap file, or leave it with a reason.'
    );
}
console.log(lines.join('\n'));

function parseArgs(argv) {
    const parsed = { base: 'main', copies: true };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--') {
            // pnpm passes the separator through to the script.
            continue;
        } else if (arg === '--base' && argv[index + 1] !== undefined) {
            parsed.base = argv[++index];
        } else if (arg.startsWith('--base=')) {
            parsed.base = arg.slice('--base='.length);
        } else if (arg === '--no-copies') {
            parsed.copies = false;
        } else {
            console.error(
                `Unknown argument: ${arg}\nUsage: report-drift [--base <ref>] [--no-copies]`
            );
            process.exit(2);
        }
    }
    return parsed;
}

function git(gitArgs) {
    return execFileSync('git', gitArgs, {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
    });
}

function resolveMergeBase(base) {
    try {
        return git(['merge-base', base, 'HEAD']).trim();
    } catch {
        console.error(`Cannot find a merge base between ${base} and HEAD.`);
        process.exit(2);
    }
}

/**
 * The files this diff changes that the report reads, each with its kind (`fileKind`), its added
 * lines (new-file line numbers) and its removed lines (old-file line numbers). Untracked files
 * count as wholly added.
 */
function readChanges(base) {
    const changes = new Map();
    const fileFor = (path, kind) => {
        if (!changes.has(path)) changes.set(path, { path, kind, added: [], removed: [] });
        return changes.get(path);
    };

    const diff = git([
        'diff',
        '--no-color',
        '--no-ext-diff',
        '-U0',
        base,
        '--',
        'packages',
        'apps',
    ]);
    let current;
    let oldLine = 0;
    let newLine = 0;
    // A file's `---`/`+++` header comes before its first hunk; inside a hunk,
    // a removed `-- ` line would otherwise read as a header.
    let inHeader = false;
    for (const line of diff.split('\n')) {
        if (line.startsWith('diff --git')) {
            current = undefined;
            inHeader = true;
        } else if (inHeader && line.startsWith('--- ')) {
            // The removed side's path; a deletion has no `+++ b/` path to take.
            const oldPath = line.slice(4).replace(/^a\//, '');
            current = oldPath === '/dev/null' ? undefined : { oldPath };
        } else if (inHeader && line.startsWith('+++ ')) {
            const newPath = line.slice(4).replace(/^b\//, '');
            const path = newPath === '/dev/null' ? current?.oldPath : newPath;
            const kind = path === undefined ? undefined : fileKind(path);
            current = kind === undefined ? undefined : fileFor(path, kind);
        } else if (line.startsWith('@@')) {
            inHeader = false;
            oldLine = Number(/-(\d+)/.exec(line)?.[1] ?? 0);
            newLine = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
        } else if (current !== undefined && line.startsWith('+')) {
            current.added.push({ line: newLine, text: line.slice(1) });
            newLine += 1;
        } else if (current !== undefined && line.startsWith('-')) {
            current.removed.push({ line: oldLine, text: line.slice(1) });
            oldLine += 1;
        }
    }

    const untracked = git([
        'ls-files',
        '--others',
        '--exclude-standard',
        '--',
        'packages',
        'apps',
    ]);
    for (const path of untracked.split('\n')) {
        const kind = fileKind(path);
        if (kind === undefined) continue;
        const text = readFileSync(join(repoRoot, path), 'utf8');
        fileFor(path, kind).added.push(
            ...text
                .split('\n')
                .map((content, index) => ({ line: index + 1, text: content }))
        );
    }
    return [...changes.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** `'source'`, `'tests'` or `'vitest-config'`, or undefined for a file the report skips. */
function fileKind(path) {
    if (VITEST_CONFIG.test(path)) return 'vitest-config';
    if (TEST_FILE.test(path)) return CODE_FILE.test(path) ? 'tests' : undefined;
    if (SOURCE_FILE.test(path)) return 'source';
    return undefined;
}

function inPath(path, scope) {
    return typeof scope === 'string' ? path.startsWith(scope) : scope.test(path);
}

function reportPatterns(changed) {
    const out = [];
    for (const {
        name,
        pattern,
        files = 'source',
        lines = 'added',
        only,
        except,
        why,
    } of PATTERNS) {
        const inScope = changed.filter(
            ({ path, kind }) =>
                kind === files &&
                (only === undefined || only.some((scope) => inPath(path, scope))) &&
                !(except ?? []).some((scope) => inPath(path, scope))
        );
        // The side whose matches are listed, and the side that cancels them.
        const [listedSide, otherSide] =
            lines === 'added' ? ['added', 'removed'] : ['removed', 'added'];
        let listedCount = 0;
        let otherCount = 0;
        const listed = [];
        for (const file of inScope) {
            // A match the same file also has on the other side is an edited or
            // moved line (a class whose `extends` changed, an assertion
            // reworded), not a new instance, so it is counted but not listed.
            // A line moved unchanged pairs with its copy first.
            const others = file[otherSide]
                .map(({ text }) => ({
                    text: text.trim(),
                    match: pattern.exec(text)?.[0],
                }))
                .filter(({ match }) => match !== undefined);
            otherCount += others.length;
            const candidates = [];
            for (const { line, text } of file[listedSide]) {
                const match = pattern.exec(text)?.[0];
                if (match === undefined) continue;
                listedCount += 1;
                const moved = others.findIndex((other) => other.text === text.trim());
                if (moved === -1) candidates.push({ line, text, match });
                else others.splice(moved, 1);
            }
            for (const { line, text, match } of candidates) {
                const edited = others.findIndex((other) => other.match === match);
                if (edited === -1) listed.push(`  ${file.path}:${line}  ${text.trim()}`);
                else others.splice(edited, 1);
            }
        }
        if (listedCount === 0 && otherCount === 0) continue;

        const [addedCount, removedCount] =
            lines === 'added' ? [listedCount, otherCount] : [otherCount, listedCount];
        const edited = listedCount - listed.length;
        const editedNote =
            edited > 0 ? ` (${edited} on edited or moved lines, not listed)` : '';
        const lineNote =
            lines === 'removed' && listed.length > 0 ? ' (old line numbers)' : '';
        out.push(
            `${name}: ${addedCount} added, ${removedCount} removed${editedNote}${lineNote}`,
            `  ${why}`,
            ...listed,
            ''
        );
    }
    if (out.at(-1) === '') out.pop();
    return out;
}

/**
 * Coverage thresholds a changed vitest config lowers or drops, against the same file at the
 * merge base.
 */
function reportThresholds(configs, base) {
    const out = [];
    for (const { path } of configs) {
        const before = readThresholds(gitShow(base, path));
        const after = readThresholds(
            existsSync(join(repoRoot, path))
                ? readFileSync(join(repoRoot, path), 'utf8')
                : ''
        );
        for (const [key, metrics] of before) {
            for (const [metric, was] of Object.entries(metrics)) {
                const now = after.get(key)?.[metric];
                if (now === undefined)
                    out.push(`  ${path}  ${key} ${metric}: ${was} → removed`);
                else if (now < was)
                    out.push(`  ${path}  ${key} ${metric}: ${was} → ${now}`);
            }
        }
    }
    if (out.length > 0)
        out.unshift('  A threshold is only raised (the `testing` skill).');
    return out;
}

/**
 * The `coverage.thresholds` entries in a vitest config's text (or a plugin config's
 * `coverageThresholds`), as a map from each glob to its metrics. Reads the text rather than
 * loading the config, so the base side needs no checkout.
 */
function readThresholds(text) {
    const thresholds = new Map();
    const start = text.search(/\b(?:coverageThresholds|thresholds)\s*:/);
    if (start === -1) return thresholds;
    const entry = /['"]([^'"]+)['"]\s*:\s*\{([^{}]*)\}/g;
    for (const [, key, body] of text.slice(start).matchAll(entry)) {
        const metrics = Object.fromEntries(
            [...body.matchAll(THRESHOLD_METRIC)].map(([, metric, value]) => [
                metric,
                Number(value),
            ])
        );
        if (Object.keys(metrics).length > 0) thresholds.set(key, metrics);
    }
    return thresholds;
}

/** A file's text at a commit, or '' when the file did not exist there. */
function gitShow(commit, path) {
    try {
        return execFileSync('git', ['show', `${commit}:${path}`], {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    } catch {
        return '';
    }
}

/** Clones jscpd finds in the source directories with a side on a line this diff added. */
async function reportCopies(changed) {
    const addedLines = new Map(
        changed.map(({ path, added }) => [path, new Set(added.map(({ line }) => line))])
    );
    if (![...addedLines.values()].some((set) => set.size > 0)) return [];

    const roots = ['packages', 'packages/plugins', 'apps']
        .flatMap((parent) =>
            listDirs(join(repoRoot, parent)).map((name) =>
                join(repoRoot, parent, name, 'src')
            )
        )
        .filter((dir) => existsSync(dir));
    const output = mkdtempSync(join(tmpdir(), 'report-drift-'));
    let clones;
    try {
        // jscpd is resolved from this script, not the repo being reported on,
        // so the script can report on another checkout.
        const cli = fileURLToPath(import.meta.resolve('jscpd/run-jscpd.js'));
        execFileSync(
            process.execPath,
            [
                cli,
                '--format',
                'typescript,tsx',
                '--min-lines',
                String(COPY_MIN_LINES),
                '--min-tokens',
                String(COPY_MIN_TOKENS),
                '--ignore',
                '**/node_modules/**,**/tests/**,**/*.test.*,**/*.gen.ts',
                // Two files importing the same modules are not a copy worth a line.
                '--ignore-pattern',
                'import\\s[^;]*;',
                '--reporters',
                'json',
                '--output',
                output,
                '--absolute',
                '--no-colors',
                ...roots,
            ],
            { cwd: repoRoot, stdio: 'ignore' }
        );
        clones = JSON.parse(
            readFileSync(join(output, 'jscpd-report.json'), 'utf8')
        ).duplicates;
    } finally {
        rmSync(output, { recursive: true, force: true });
    }

    const out = [];
    const seen = new Set();
    for (const { firstFile, secondFile } of clones) {
        const sides = [firstFile, secondFile].map((side) => ({
            path: relative(repoRoot, side.name),
            start: side.start,
            end: side.end,
        }));
        const touched = sides.some(({ path, start, end }) => {
            const set = addedLines.get(path);
            if (set === undefined) return false;
            for (let line = start; line <= end; line += 1) if (set.has(line)) return true;
            return false;
        });
        if (!touched) continue;
        const text = `  ${sides[0].path}:${sides[0].start}-${sides[0].end}  ↔  ${sides[1].path}:${sides[1].start}-${sides[1].end}  (${sides[0].end - sides[0].start + 1} lines)`;
        if (seen.has(text)) continue;
        seen.add(text);
        out.push(text);
    }
    return out;
}

function listDirs(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== 'plugins')
        .map((entry) => entry.name);
}
