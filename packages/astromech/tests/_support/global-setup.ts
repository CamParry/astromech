/**
 * Vitest `globalSetup` for every suite that loads `harness.ts`: core's and the
 * plugins' (through `plugin-vitest-config.ts`).
 *
 * It makes one temp directory per run for the harness's test databases and
 * hands its path to the workers with `provide`. The returned teardown runs in
 * the main process once every worker has finished, so the directory goes even
 * though a worker thread never sees `process.on('exit')`.
 */
import type { TestProject } from 'vitest/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Declaration merging needs an `interface`.
declare module 'vitest' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    export interface ProvidedContext {
        /** The directory `createTestDb()` writes its database files into. */
        testDbDir: string;
    }
}

export default function setup(project: TestProject): () => void {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astromech-test-'));
    project.provide('testDbDir', dir);
    return () => fs.rmSync(dir, { recursive: true, force: true });
}
