/**
 * A wrangler project directory of its own for each test file that starts
 * wrangler's local emulation.
 *
 * Wrangler keeps local state (D1's SQLite files, R2's objects, the storage of
 * its own Durable Objects) in `.wrangler/state` under the process's working
 * directory: `getPlatformProxy()` passes workerd a relative persist path, and
 * the only way to move it is its `persist` option, which `resolveBinding()`
 * does not pass. Two files that start the proxy from one directory race: one
 * file's table drops land in the middle of the other's migration, and two
 * workerd processes opening the same SQLite files fail with `SQLITE_BUSY`.
 *
 * So each such file copies core's `wrangler.jsonc` into a directory under the
 * run's temp dir and starts wrangler from there: in process through
 * `enterWranglerProject`, in a child process through its `cwd`. A worker thread
 * cannot change its working directory, so the in-process files run in core's
 * `core-wrangler` project, whose `forks` pool gives each file a process.
 */

// Declares `testDbDir` on vitest's `ProvidedContext`, for `inject` below.
import type {} from './global-setup';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inject } from 'vitest';

/** The config every copy is made from; its comment names the bindings' users. */
const WRANGLER_CONFIG = join(import.meta.dirname, '../../wrangler.jsonc');

/**
 * Make a directory holding a copy of core's `wrangler.jsonc`. Wrangler started
 * from it keeps its state in `<dir>/.wrangler`. Remove it with
 * `removeWranglerProject` once the proxy that uses it is disposed.
 */
export function createWranglerProject(): string {
    const dir = mkdtempSync(join(inject('testDbDir'), 'wrangler-'));
    copyFileSync(WRANGLER_CONFIG, join(dir, 'wrangler.jsonc'));
    return dir;
}

/** Remove a directory `createWranglerProject` made, state included. */
export function removeWranglerProject(dir: string): void {
    rmSync(dir, { recursive: true, force: true });
}

/**
 * Make a wrangler project and make it the process's working directory, so
 * wrangler started in this process finds the config there and keeps its state
 * there. Returns a function that restores the working directory and removes
 * the project: call it after `disposeBindings()`.
 */
export function enterWranglerProject(): () => void {
    const previous = process.cwd();
    const dir = createWranglerProject();
    process.chdir(dir);
    return () => {
        process.chdir(previous);
        removeWranglerProject(dir);
    };
}
