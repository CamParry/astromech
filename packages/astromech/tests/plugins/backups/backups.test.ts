/**
 * Test suite for @astromech/backups
 *
 * Uses a real libsql FILE database (dump/restore require file:) with the
 * plugin_backups_runs table created directly via drizzle push. Storage is
 * backed by FilesystemStorage pointed at a tmpdir. The PluginContext is
 * built by hand — no need for the full plugin runtime.
 *
 * Cases:
 *  1. libsql dump → restore round-trip (file: URL works, non-file: throws)
 *  2. restore preserves listed tables
 *  3. performBackup success — artifact in storage + success run row
 *  4. performBackup failure — no dump capability → failed run row
 *  5. rotate keep-N — oldest artifacts deleted, rows marked artifactDeletedAt
 *  6. in-process guard — isBackupRunning reflects an in-flight performBackup
 */

import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { libsqlDriver } from '@/database/drivers/libsql.js';
import { FilesystemStorage } from '@/storage/filesystem.js';
import { backupRunsTable } from '@astromech/backups/schema';
import { performBackup, rotate, isBackupRunning } from '@astromech/backups/internals';
import type { PluginContext, PluginDatabase, PluginStorage } from '@/types/index.js';

declare global {
    var __astromechBackupRunning: boolean | undefined;
}

// ============================================================================
// Helpers
// ============================================================================

/** Absolute path for tmp files created in this test run. */
function makeTmpDir(): string {
    return join(tmpdir(), `astromech-backups-test-${randomUUID()}`);
}

/**
 * Create a real file-based libsql DB with the plugin_backups_runs table.
 * Returns both the drizzle handle AND the driver (which has dump/restore).
 */
async function makeFileDb(dbPath: string): Promise<{
    db: LibSQLDatabase;
    driver: ReturnType<typeof libsqlDriver>;
}> {
    const url = `file:${dbPath}`;
    const driver = libsqlDriver({ url });
    const db = driver.getInstance();

    // Create the backups table directly — no full migrations needed for these tests.
    await db.run(
        sql.raw(`
            CREATE TABLE IF NOT EXISTS plugin_backups_runs (
                id TEXT PRIMARY KEY,
                key TEXT,
                status TEXT NOT NULL,
                trigger TEXT NOT NULL,
                size_bytes INTEGER,
                error TEXT,
                started_at INTEGER NOT NULL,
                finished_at INTEGER,
                artifact_deleted_at INTEGER
            )
        `)
    );

    return { db, driver };
}

/** Build a minimal PluginContext for the backups plugin. */
function makeCtx(
    db: LibSQLDatabase,
    storage: PluginStorage,
    database: PluginDatabase
): PluginContext {
    return {
        db,
        config: null as unknown as PluginContext['config'],
        user: null,
        sdk: null as unknown as PluginContext['sdk'],
        entries: null as unknown as PluginContext['entries'],
        sendEmail: async () => undefined,
        logger: {
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
        },
        env: {},
        emit: async () => undefined,
        storage,
        database,
    };
}

/** Wrap a FilesystemStorage to satisfy PluginStorage (same interface). */
function makeStorage(dir: string): PluginStorage {
    return new FilesystemStorage({ dir });
}

// ============================================================================
// Test state
// ============================================================================

let tmpBase: string;
let dbPath: string;
let storageDir: string;

beforeEach(async () => {
    tmpBase = makeTmpDir();
    await mkdir(tmpBase, { recursive: true });
    dbPath = join(tmpBase, 'test.db');
    storageDir = join(tmpBase, 'storage');
    await mkdir(storageDir, { recursive: true });

    // Reset the in-process backup guard between tests.
    globalThis.__astromechBackupRunning = false;
});

afterEach(async () => {
    globalThis.__astromechBackupRunning = false;
    await rm(tmpBase, { recursive: true, force: true });
});

// ============================================================================
// 1. libsql dump → restore round-trip
// ============================================================================

describe('libsqlDriver.dump / restore', () => {
    it('should round-trip a table full of rows', async () => {
        const { db, driver } = await makeFileDb(dbPath);

        // Create a simple test table and seed it.
        await db.run(sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`));
        await db.run(sql.raw(`INSERT INTO items VALUES ('1','alpha'), ('2','beta')`));

        const dump = await driver.dump();
        // Mutate after dump.
        await db.run(sql.raw(`DELETE FROM items`));
        await db.run(sql.raw(`INSERT INTO items VALUES ('3','gamma')`));

        const rowsBefore = await db.all(sql.raw(`SELECT * FROM items`));
        expect(rowsBefore).toHaveLength(1);

        await driver.restore(dump.stream, { preserve: [] });
        await dump.cleanup();

        const rowsAfter = await db.all(sql.raw(`SELECT * FROM items`));
        expect(rowsAfter).toHaveLength(2);
        expect(
            (rowsAfter as Record<string, unknown>[]).map((r) => r['name']).sort()
        ).toEqual(['alpha', 'beta']);
    });

    it('should throw a clear error for a non-file: URL on dump', async () => {
        const remoteDriver = libsqlDriver({ url: 'libsql://example.turso.io' });
        await expect(remoteDriver.dump()).rejects.toThrow('file:');
    });

    it('should throw a clear error for a non-file: URL on restore', async () => {
        const remoteDriver = libsqlDriver({ url: 'libsql://example.turso.io' });
        const emptyStream = new ReadableStream<Uint8Array>({
            start(c) {
                c.close();
            },
        });
        await expect(remoteDriver.restore(emptyStream, { preserve: [] })).rejects.toThrow(
            'file:'
        );
    });
});

// ============================================================================
// 2. restore preserves listed tables
// ============================================================================

describe('libsqlDriver.restore — preserve', () => {
    it('should NOT revert preserved tables while reverting non-preserved tables', async () => {
        const { db, driver } = await makeFileDb(dbPath);

        // `makeFileDb` already creates plugin_backups_runs. Add a second table.
        await db.run(sql.raw(`CREATE TABLE things (id TEXT PRIMARY KEY, val TEXT)`));

        await db.run(sql.raw(`INSERT INTO things VALUES ('t1','original-thing')`));
        await db.run(
            sql.raw(
                `INSERT INTO plugin_backups_runs VALUES ('r1',NULL,'success','manual',NULL,NULL,1,NULL,NULL)`
            )
        );

        const dump = await driver.dump();

        // Mutate both tables after the dump.
        await db.run(sql.raw(`DELETE FROM things`));
        await db.run(sql.raw(`INSERT INTO things VALUES ('t2','post-dump-thing')`));
        await db.run(sql.raw(`DELETE FROM plugin_backups_runs`));
        await db.run(
            sql.raw(
                `INSERT INTO plugin_backups_runs VALUES ('r2',NULL,'failed','scheduled',NULL,'boom',2,NULL,NULL)`
            )
        );

        // Restore, preserving plugin_backups_runs.
        await driver.restore(dump.stream, { preserve: ['plugin_backups_runs'] });
        await dump.cleanup();

        // `things` should be reverted to the original state.
        const things = (await db.all(sql.raw(`SELECT * FROM things`))) as Record<
            string,
            unknown
        >[];
        expect(things).toHaveLength(1);
        expect(things[0]?.['val']).toBe('original-thing');

        // `plugin_backups_runs` should keep the post-dump state.
        const runs = (await db.all(
            sql.raw(`SELECT * FROM plugin_backups_runs`)
        )) as Record<string, unknown>[];
        expect(runs).toHaveLength(1);
        expect(runs[0]?.['id']).toBe('r2');
    });
});

// ============================================================================
// 3. performBackup — success path
// ============================================================================

describe('performBackup — success', () => {
    it('should create a gzip artifact in storage and a success run row', async () => {
        const { db, driver } = await makeFileDb(dbPath);
        const storage = makeStorage(storageDir);

        const database: PluginDatabase = {
            dialect: 'libsql',
            dump: () => driver.dump(),
        };

        const ctx = makeCtx(db, storage, database);
        const row = await performBackup(ctx, 'manual', { keep: 10 });

        expect(row.status).toBe('success');
        expect(row.key).toBeTruthy();
        expect(row.key).toMatch(/\.sqlite\.gz$/);
        expect(row.sizeBytes).toBeGreaterThan(0);
        expect(row.finishedAt).toBeInstanceOf(Date);

        // Artifact must exist in storage.
        const artifact = await storage.get(row.key!);
        expect(artifact).not.toBeNull();
        expect(artifact!.size).toBeGreaterThan(0);
    });
});

// ============================================================================
// 4. performBackup — failure path (no dump capability)
// ============================================================================

describe('performBackup — failure', () => {
    it('should mark the run as failed when dump is not supported', async () => {
        const { db } = await makeFileDb(dbPath);
        const storage = makeStorage(storageDir);

        // Deliberately omit dump from the database capability.
        const database: PluginDatabase = { dialect: 'test-no-dump' };

        const ctx = makeCtx(db, storage, database);
        const row = await performBackup(ctx, 'manual', { keep: 10 });

        expect(row.status).toBe('failed');
        expect(row.error).toMatch(/dump not supported/);
        expect(row.finishedAt).toBeInstanceOf(Date);

        // No artifact should be written to storage.
        const artifacts = await storage.list('');
        expect(artifacts).toHaveLength(0);
    });
});

// ============================================================================
// 5. rotate keep-N
// ============================================================================

describe('rotate', () => {
    it('should delete the oldest artifacts when runs exceed keep', async () => {
        const { db, driver } = await makeFileDb(dbPath);
        const storage = makeStorage(storageDir);
        const database: PluginDatabase = {
            dialect: 'libsql',
            dump: () => driver.dump(),
        };
        const ctx = makeCtx(db, storage, database);

        // Create 5 successful runs. To guarantee distinct startedAt seconds we
        // insert the run rows with explicit timestamps rather than relying on
        // wall-clock sleeps (the column stores Unix seconds, not milliseconds).
        const runIds: string[] = [];
        const baseTs = Math.floor(Date.now() / 1000) - 100; // 100 s ago

        for (let i = 0; i < 5; i++) {
            const id = randomUUID();
            runIds.push(id);
            // Write artifact to storage so rotation can delete it.
            const key = `${baseTs + i}-${id.slice(0, 8)}.sqlite.gz`;
            await storage.put(key, new Uint8Array([0, 1, 2]));
            // Insert a success row with a known, distinct startedAt.
            await db.run(
                sql.raw(
                    `INSERT INTO plugin_backups_runs (id, key, status, trigger, started_at)
                     VALUES ('${id}', '${key}', 'success', 'manual', ${baseTs + i})`
                )
            );
        }

        // Verify 5 artifacts exist before rotation.
        const beforeKeys = await storage.list('');
        expect(beforeKeys).toHaveLength(5);

        // Rotate to keep only the 3 newest.
        await rotate(ctx, 3);

        // Check DB rows.
        const allRows = await db.select().from(backupRunsTable);
        const deleted = allRows.filter((r) => r.artifactDeletedAt !== null);
        const kept = allRows.filter((r) => r.artifactDeletedAt === null);

        expect(deleted).toHaveLength(2);
        expect(kept).toHaveLength(3);

        // The oldest 2 rows (lowest startedAt) must be marked deleted.
        const sortedByStart = [...allRows].sort(
            (a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0)
        );
        expect(sortedByStart[0]?.artifactDeletedAt).toBeInstanceOf(Date);
        expect(sortedByStart[1]?.artifactDeletedAt).toBeInstanceOf(Date);
        expect(sortedByStart[2]?.artifactDeletedAt).toBeNull();

        // Verify storage only has 3 artifacts remaining.
        const afterKeys = await storage.list('');
        expect(afterKeys).toHaveLength(3);
    });

    it('should be a no-op when runs are within keep limit', async () => {
        const { db, driver } = await makeFileDb(dbPath);
        const storage = makeStorage(storageDir);
        const database: PluginDatabase = {
            dialect: 'libsql',
            dump: () => driver.dump(),
        };
        const ctx = makeCtx(db, storage, database);

        await performBackup(ctx, 'manual', { keep: 99 });
        await performBackup(ctx, 'manual', { keep: 99 });

        await rotate(ctx, 5);

        const allRows = await db.select().from(backupRunsTable);
        expect(allRows.every((r) => r.artifactDeletedAt === null)).toBe(true);

        const afterKeys = await storage.list('');
        expect(afterKeys).toHaveLength(2);
    });
});

// ============================================================================
// 6. in-process guard
// ============================================================================

describe('isBackupRunning / in-process guard', () => {
    it('should return false when no backup is running', () => {
        globalThis.__astromechBackupRunning = false;
        expect(isBackupRunning()).toBe(false);
    });

    it('should return true while a backup is in flight', async () => {
        const { db, driver } = await makeFileDb(dbPath);
        const storage = makeStorage(storageDir);

        // Intercept dump to check the flag mid-flight.
        let flagDuringDump = false;
        const database: PluginDatabase = {
            dialect: 'libsql',
            dump: async () => {
                flagDuringDump = isBackupRunning();
                return driver.dump();
            },
        };

        const ctx = makeCtx(db, storage, database);
        await performBackup(ctx, 'manual', { keep: 10 });

        expect(flagDuringDump).toBe(true);
    });

    it('should return false again after the backup completes', async () => {
        const { db, driver } = await makeFileDb(dbPath);
        const storage = makeStorage(storageDir);
        const database: PluginDatabase = {
            dialect: 'libsql',
            dump: () => driver.dump(),
        };

        const ctx = makeCtx(db, storage, database);
        await performBackup(ctx, 'manual', { keep: 10 });

        expect(isBackupRunning()).toBe(false);
    });

    it('should return false after a failed backup', async () => {
        const { db } = await makeFileDb(dbPath);
        const storage = makeStorage(storageDir);
        const database: PluginDatabase = { dialect: 'test-no-dump' };

        const ctx = makeCtx(db, storage, database);
        await performBackup(ctx, 'manual', { keep: 10 });

        expect(isBackupRunning()).toBe(false);
    });
});
