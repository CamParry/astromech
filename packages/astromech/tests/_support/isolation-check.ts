/**
 * The check behind each package's `tests/isolation-list.test.ts`.
 *
 * Core's suite and the admin's both run with `isolate: false`, so a worker
 * imports the module graph once and reuses it across files. A test file that
 * mocks a module other files import, resets the module registry, stubs a global
 * or writes a `globalThis.__astromech*` global leaks into the files that run
 * after it, so it has to opt back into per-file isolation. Each package lists
 * those files in its own `tests/_support/isolated-tests.ts`, and its
 * `tests/isolation-list.test.ts` compares that list with what this finds, so
 * neither list can drift.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const leaks = new RegExp(
    [
        'vi\\.(mock|doMock|stubGlobal|stubEnv|resetModules)\\(',
        'globalThis\\.__astromech',
    ].join('|')
);

// The test that calls this may name the patterns above in its comments, so it
// is left out.
const callingTest = 'tests/isolation-list.test.ts';

/**
 * The test files under `packageRoot/tests` that leak state into a shared module
 * graph, as sorted paths relative to `packageRoot`, the form each package's
 * isolated list uses.
 */
export function findLeakingTestFiles(packageRoot: string): string[] {
    return testFiles(join(packageRoot, 'tests'))
        .filter((path) => leaks.test(readFileSync(path, 'utf8')))
        .map((path) => relative(packageRoot, path).replaceAll('\\', '/'))
        .filter((path) => path !== callingTest)
        .sort();
}

function testFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return testFiles(path);
        return /\.test\.tsx?$/.test(entry.name) ? [path] : [];
    });
}
