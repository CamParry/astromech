// Guards the boot checks and `check:install` against a stale `dist`. Each boot
// check builds only its own app, not the packages, so a package `src` edit
// followed by a standalone boot check would verify the previous package build.
// This fails loudly when a package's `dist` is older than its `src`.
import { readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceDependencies, workspacePackages } from './lib/workspace-packages.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Throw if a package's `dist` is older than its `src`, naming the stale
 * packages and the remedy. Given an app's directory (`apps/demo`), it checks
 * the workspace packages that app depends on, directly or through another,
 * which are the builds its `^build` waits for. Without one, it checks every
 * package that is not private. A package is checked only when its
 * package.json has a `build` script and it has a `src/` directory.
 */
export async function requireFreshDist(appDirectory) {
    const packages = workspacePackages(repoRoot);
    let checked;
    if (appDirectory === undefined) {
        checked = packages.filter((each) => each.manifest.private !== true);
    } else {
        const app = packages.find(
            (each) => each.directory === resolve(repoRoot, appDirectory)
        );
        if (app === undefined) {
            throw new Error(`${appDirectory} is not a workspace package`);
        }
        checked = workspaceDependencies(packages, app);
    }

    const stale = [];
    for (const { directory: packageDir, manifest } of checked) {
        if (manifest.scripts?.build === undefined) continue;

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
// build, and test files (`*.test.ts`, `*.test.tsx`, `*.test-d.ts`) are not
// build inputs, so neither should mark `dist` stale.
function isBuildInput(fileName) {
    return (
        !fileName.endsWith('.gen.ts') &&
        !fileName.endsWith('.test.ts') &&
        !fileName.endsWith('.test.tsx') &&
        !fileName.endsWith('.test-d.ts')
    );
}

async function isDirectory(path) {
    try {
        return (await stat(path)).isDirectory();
    } catch {
        return false;
    }
}
