#!/usr/bin/env node
/**
 * Prints where a branch adds a known drift pattern or a copy of existing code, for a person to
 * read at review. It compares the merge base of `--base` (default `main`) and HEAD against the
 * working tree, so committed and uncommitted changes both count, and reads only the source files
 * under `packages/*\/src`, `packages/plugins/*\/src` and `apps/*\/src`.
 *
 * It never fails on what it finds: it exits 0 whatever the report says, and non-zero only on bad
 * arguments or its own crash. `--no-copies` skips the jscpd scan.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// The core container and layout field types (`fields/flatten.ts`,
// `config/validate/field-tree.ts`). Code outside the fields directories that
// branches on one of them usually wants a helper like `isLayoutField`.
const STRUCTURAL_TYPES = 'group|accordion|tabs|tab|repeater|blocks|tree';

/**
 * Each entry: `name`, `pattern` (tested per line), `only` / `except` (path prefixes from the
 * repo root) and `why` (printed under the name). Add a pattern by adding a line.
 */
const PATTERNS = [
    {
        name: '`as unknown as` cast',
        pattern: /\bas unknown as\b/,
        why: 'A cast hides a type the code could state.',
    },
    {
        name: 'Inline query key',
        pattern: /\bqueryKey:\s*\[/,
        except: ['packages/admin/src/hooks/use-query-keys.ts'],
        why: 'Query keys come from the factory in hooks/use-query-keys.ts.',
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
        name: '`collection` as an identifier',
        pattern: /(?<![\w'"`/.-])[cC]ollection\w*\b(?![-'"`])|[a-z0-9]Collection/,
        why: 'TERMINOLOGY.md calls this an entry type.',
    },
];

/** Source files the report reads, as paths from the repo root. Tests are excluded. */
const SOURCE_FILE =
    /^(packages\/plugins\/[^/]+|packages\/[^/]+|apps\/[^/]+)\/src\/.+\.(ts|tsx|mjs|js)$/;
const TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

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
const copySection = args.copies ? await reportCopies(files) : [];

if (patternSection.length === 0 && copySection.length === 0) {
    lines.push('', args.copies ? 'Nothing found.' : 'Nothing found (copies skipped).');
} else {
    lines.push('', 'Patterns', '');
    lines.push(...(patternSection.length > 0 ? patternSection : ['  none']));
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
 * The source files this diff changes, each with its added lines (new-file line numbers) and
 * removed lines. Untracked files count as wholly added.
 */
function readChanges(base) {
    const changes = new Map();
    const fileFor = (path) => {
        if (!changes.has(path)) changes.set(path, { path, added: [], removed: [] });
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
            current = path !== undefined && isSource(path) ? fileFor(path) : undefined;
        } else if (line.startsWith('@@')) {
            inHeader = false;
            newLine = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
        } else if (current !== undefined && line.startsWith('+')) {
            current.added.push({ line: newLine, text: line.slice(1) });
            newLine += 1;
        } else if (current !== undefined && line.startsWith('-')) {
            current.removed.push({ text: line.slice(1) });
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
    for (const path of untracked.split('\n').filter(isSource)) {
        const text = readFileSync(join(repoRoot, path), 'utf8');
        fileFor(path).added.push(
            ...text
                .split('\n')
                .map((content, index) => ({ line: index + 1, text: content }))
        );
    }
    return [...changes.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function isSource(path) {
    return SOURCE_FILE.test(path) && !TEST_FILE.test(path);
}

function reportPatterns(changed) {
    const out = [];
    for (const { name, pattern, only, except, why } of PATTERNS) {
        const inScope = changed.filter(
            ({ path }) =>
                (only === undefined || only.some((prefix) => path.startsWith(prefix))) &&
                !(except ?? []).some((prefix) => path.startsWith(prefix))
        );
        let addedCount = 0;
        let removedCount = 0;
        const listed = [];
        for (const file of inScope) {
            // A match the same file also removes is an edited line (a class
            // whose `extends` changed), not a new instance, so it is counted
            // but not listed.
            const removedMatches = file.removed
                .map(({ text }) => pattern.exec(text)?.[0])
                .filter(Boolean);
            removedCount += removedMatches.length;
            for (const { line, text } of file.added) {
                const match = pattern.exec(text)?.[0];
                if (match === undefined) continue;
                addedCount += 1;
                const edited = removedMatches.indexOf(match);
                if (edited === -1) listed.push(`  ${file.path}:${line}  ${text.trim()}`);
                else removedMatches.splice(edited, 1);
            }
        }
        if (addedCount === 0 && removedCount === 0) continue;

        const edited = addedCount - listed.length;
        const editedNote = edited > 0 ? ` (${edited} on edited lines, not listed)` : '';
        out.push(
            `${name}: ${addedCount} added, ${removedCount} removed${editedNote}`,
            `  ${why}`,
            ...listed,
            ''
        );
    }
    if (out.at(-1) === '') out.pop();
    return out;
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
