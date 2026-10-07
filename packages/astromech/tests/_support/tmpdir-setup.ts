/**
 * Vitest setup file for every project that lists `global-setup.ts`: points the
 * worker's `os.tmpdir()`, and the temp dir of any process it starts, at the
 * run directory's `tmp/` (`run-temp-dir.ts`). A temp file a test makes then
 * lands where the run's teardown checks that it was removed.
 */
// Declares `testTmpDir` on vitest's `ProvidedContext`, for `inject` below.
import type {} from './global-setup';
import { inject } from 'vitest';

const dir = inject('testTmpDir');
// `os.tmpdir()` reads TMPDIR on POSIX and TEMP or TMP on Windows.
for (const name of ['TMPDIR', 'TEMP', 'TMP']) process.env[name] = dir;
