/**
 * Keeps `isolatedTests` honest.
 *
 * The suite runs with `isolate: false`, so a file that mocks a shared module,
 * stubs a global, or writes `globalThis.__astromech` has to opt back into
 * per-file isolation. Forgetting to list one produces a failure somewhere else
 * in the suite, which is a bad way to find out. This test finds it here.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedTests } from '@tests/isolated-tests';
import { describe, expect, it } from 'vitest';

// This file names the patterns it looks for, so it excludes itself below.
const leaks = new RegExp(
    ['vi\\.(mock|doMock|stubGlobal|stubEnv)\\(', 'globalThis\\.__astromech'].join('|')
);

const testsDir = fileURLToPath(new URL('.', import.meta.url));
const thisFile = 'tests/isolation-list.test.ts';

function testFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return testFiles(path);
        return /\.test\.tsx?$/.test(entry.name) ? [path] : [];
    });
}

describe('the isolated-test list', () => {
    it('names every test file that leaks state into a shared module graph', () => {
        const found = testFiles(testsDir)
            .filter((path) => leaks.test(readFileSync(path, 'utf8')))
            .map((path) => `tests/${relative(testsDir, path).replaceAll('\\', '/')}`)
            .filter((path) => path !== thisFile)
            .sort();

        expect(found).toEqual([...isolatedTests].sort());
    });
});
