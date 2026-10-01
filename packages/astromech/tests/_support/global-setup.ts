/**
 * Vitest `globalSetup` for every suite that loads `harness.ts`: core's and the
 * plugins' (through `plugin-vitest-config.ts`).
 *
 * It sets the environment every such suite shares, makes one temp directory per
 * run for the harness's test databases, and migrates one database file there,
 * the template that `createTestDb()` copies for each test. Copying a file is far cheaper than running the migration chain
 * per test. Both paths reach the workers through `provide`. The returned
 * teardown runs in the main process once every worker has finished, so the
 * directory goes even though a worker thread never sees `process.on('exit')`.
 */
import type { TestProject } from 'vitest/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createClient } from '@libsql/client';
import { migrateTestDb, openTestDb } from './test-db';

// Declaration merging needs an `interface`.
declare module 'vitest' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    export interface ProvidedContext {
        /** The directory `createTestDb()` writes its database files into. */
        testDbDir: string;
        /** The migrated database file `createTestDb()` copies for each test. */
        testDbTemplate: string;
    }
}

/**
 * Migrate a database at `file` and close it. A copy must be the whole
 * database, so this fails if SQLite left a journal or WAL file beside it.
 */
async function buildTemplate(file: string): Promise<void> {
    const client = createClient({ url: `file:${file}` });
    const db = openTestDb(client);
    try {
        await migrateTestDb(db);
    } finally {
        await db.destroy();
        client.close();
    }
    const leftover = ['-journal', '-wal', '-shm']
        .map((suffix) => `${file}${suffix}`)
        .filter((sibling) => fs.existsSync(sibling));
    if (leftover.length > 0) {
        throw new Error(`The test database template left ${leftover.join(', ')}`);
    }
}

export default async function setup(project: TestProject): Promise<() => void> {
    // Better Auth warns on every instance built without a base URL. Set here,
    // before the workers start, so they inherit it.
    process.env['BETTER_AUTH_URL'] ??= 'http://localhost:4321';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astromech-test-'));
    const template = path.join(dir, 'template.db');
    try {
        await buildTemplate(template);
    } catch (error) {
        fs.rmSync(dir, { recursive: true, force: true });
        throw error;
    }
    project.provide('testDbDir', dir);
    project.provide('testDbTemplate', template);
    return () => fs.rmSync(dir, { recursive: true, force: true });
}
