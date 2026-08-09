#!/usr/bin/env node
// Fails when a markdown link or a backticked path in the repo's documentation
// no longer resolves. Catches renames that nobody propagated.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
    join('roadmap', 'planned', ''),
    join('roadmap', 'completed', ''),
    join('decisions', ''),
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

const failures = [];

for (const file of markdownFiles(repoRoot)) {
    const local = relative(repoRoot, file);

    const source = readFileSync(file, 'utf8');
    const body = withoutFencedBlocks(source);

    for (const { target, raw } of markdownLinks(body)) {
        if (!resolvesFrom(file, target)) {
            failures.push({ file, raw, target });
        }
    }

    if (PATHS_UNCHECKED_TREES.some((tree) => local.startsWith(tree))) continue;

    for (const token of backtickedPaths(body)) {
        if (!isPathCandidate(file, token)) continue;
        if (!resolvesFrom(file, token)) {
            failures.push({ file, raw: `\`${token}\``, target: token });
        }
    }
}

if (failures.length > 0) {
    console.error(`check:docs — ${failures.length} unresolved reference(s):\n`);
    for (const { file, raw, target } of failures) {
        console.error(`  ${relative(repoRoot, file)}\n    ${raw} → ${target}`);
    }
    console.error('\nFix the reference, or the thing it points at.');
    process.exit(1);
}

console.log('check:docs — all markdown references resolve');

function* markdownFiles(dir) {
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
function withoutFencedBlocks(source) {
    return source.replace(/^```[\s\S]*?^```/gm, '');
}

function* markdownLinks(body) {
    for (const match of body.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
        const target = stripAnchor(match[1]);
        if (!target) continue;
        if (/^(https?:|mailto:|#|\/)/.test(target)) continue;
        yield { target, raw: match[0] };
    }
}

function* backtickedPaths(body) {
    const seen = new Set();
    for (const match of body.matchAll(/`([^`\n]+)`/g)) {
        const token = stripAnchor(match[1].trim().replace(/[.,;:]+$/, ''));
        if (!token || seen.has(token)) continue;
        seen.add(token);
        yield token;
    }
}

function stripAnchor(value) {
    return value.split('#')[0].trim();
}

function isPathCandidate(file, token) {
    if (/[\s*<>(){}|?=,'"$!]/.test(token)) return false;
    if (/^(https?:|mailto:|@|#|\/|~)/.test(token)) return false;
    if (token.includes(':')) return false;
    if (GENERATED.some((segment) => `/${token}`.includes(segment))) return false;
    if (token.startsWith('.') && !token.startsWith('./') && !token.startsWith('../'))
        return false;
    if (!token.includes('/') && !PATH_EXTENSIONS.has(extname(token))) return false;

    const [head] = token.replace(/^\.\//, '').split('/');
    if (!head) return false;
    return (
        existsSync(resolve(dirname(file), head)) || existsSync(resolve(repoRoot, head))
    );
}

function resolvesFrom(file, target) {
    const clean = target.replace(/\/$/, '');
    const candidates = [resolve(dirname(file), clean), resolve(repoRoot, clean)];
    return candidates.some(
        (candidate) => existsSync(candidate) || matchesByPrefix(candidate)
    );
}

// `decisions/0003` names a record whose filename carries a title after the
// number. Resolve it against the numbered prefix rather than demanding the
// writer paste the whole slug.
function matchesByPrefix(candidate) {
    const parent = dirname(candidate);
    const stem = candidate.slice(parent.length + 1);
    if (!/^\d{4}$/.test(stem) || !existsSync(parent)) return false;
    return readdirSync(parent).some((entry) => entry.startsWith(`${stem}-`));
}
