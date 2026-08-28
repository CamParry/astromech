// Guards the boot checks against a stale `dist`. Each boot check builds only
// its own app, not the packages, so a package `src` edit followed by a
// standalone boot check would verify the previous package build. This fails
// loudly when any published package's `dist` is older than its `src`.
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Throw if any published package's `dist` is older than its `src`, naming the
 * stale packages and the remedy. A package counts as published when its
 * package.json has a `build` script and it carries a `src/` directory.
 */
export async function requireFreshDist() {
    const packageDirs = [
        ...(await packageDirsUnder('packages')),
        ...(await packageDirsUnder(join('packages', 'plugins'))),
    ];

    const stale = [];
    for (const packageDir of packageDirs) {
        const manifest = await readManifest(packageDir);
        if (manifest?.scripts?.build === undefined) continue;

        const srcDir = join(packageDir, 'src');
        if (!(await isDirectory(srcDir))) continue;

        const newestSrc = await newestMtime(srcDir, isBuildInput);
        const newestDist = await newestMtime(join(packageDir, 'dist'), () => true);

        // A missing `dist` (never built) or a source newer than the build both
        // mean the boot check would run against stale output.
        if (newestDist === undefined || newestSrc > newestDist) {
            stale.push(manifest.name ?? packageDir);
        }
    }

    if (stale.length > 0) {
        throw new Error(
            `dist is stale for: ${stale.join(', ')} — run \`pnpm run build\` (or \`pnpm run build:js\`) before the boot check`
        );
    }
}

/** The immediate subdirectories of a repo-relative directory, as absolute paths. */
async function packageDirsUnder(relativeDir) {
    const parent = join(repoRoot, relativeDir);
    const entries = await readdir(parent, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(parent, entry.name));
}

/** The parsed package.json for a directory, or undefined if it has none. */
async function readManifest(packageDir) {
    try {
        const raw = await readFile(join(packageDir, 'package.json'));
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

/**
 * The newest mtimeMs under a directory tree among files the predicate keeps,
 * or undefined when the directory is missing or holds no kept file. Recursed by
 * hand so the exclusions apply per file.
 */
async function newestMtime(dir, keep) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return undefined;
    }

    let newest;
    for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            const nested = await newestMtime(path, keep);
            if (nested !== undefined && (newest === undefined || nested > newest)) {
                newest = nested;
            }
            continue;
        }
        if (!keep(entry.name)) continue;
        const { mtimeMs } = await stat(path);
        if (newest === undefined || mtimeMs > newest) newest = mtimeMs;
    }
    return newest;
}

// The route tree (`*.gen.ts`) is regenerated on a timing unrelated to the
// build, and test files (`*.test.ts`, `*.test.tsx`) are not build inputs, so
// neither should mark `dist` stale.
function isBuildInput(fileName) {
    return (
        !fileName.endsWith('.gen.ts') &&
        !fileName.endsWith('.test.ts') &&
        !fileName.endsWith('.test.tsx')
    );
}

async function isDirectory(path) {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}
