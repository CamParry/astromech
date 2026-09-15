/**
 * Keeps the admin's `isolatedTests` honest.
 *
 * The suite runs with `isolate: false`, so a file that leaks state into a shared
 * module graph has to opt back into per-file isolation. Forgetting to list one
 * produces a failure somewhere else in the suite, which is a bad way to find
 * out. This test finds it here. `@tests/isolation-check`, in core's test
 * support, says what counts as a leak, and core's suite runs the same check over
 * its own tests.
 */
import { fileURLToPath } from 'node:url';
import { findLeakingTestFiles } from '@tests/isolation-check';
import { describe, expect, it } from 'vitest';
import { isolatedTests } from './_support/isolated-tests';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

describe('the isolated-test list', () => {
    it('names every test file that leaks state into a shared module graph', () => {
        expect(findLeakingTestFiles(packageRoot)).toEqual([...isolatedTests].sort());
    });
});
