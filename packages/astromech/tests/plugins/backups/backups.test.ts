/**
 * Test suite for @astromech/backups
 *
 * Uses a real libsql FILE database (dump/restore require file:) with the
 * plugin_backups_runs table created directly via drizzle push. Storage is
 * backed by the filesystem driver pointed at a tmpdir. The PluginContext is
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
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { libsqlDriver } from '@/database/drivers/libsql.js';
import { filesystem } from '@/storage/drivers/filesystem.js';
import { listAll } from '@/storage/prefix.js';
import { decodeWith } from '@/database/codec.js';
import { backupRunsTable } from '@astromech/backups/tables';
import type { DB } from '@/database/types.js';
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
 * Returns both the Kysely handle AND the driver (which has dump/restore).
 */
async function makeFileDb(dbPath: string): Promise<{
    db: Kysely<DB>;
    driver: ReturnType<typeof libsqlDriver>;
}> {
    const url = `file:${dbPath}`;
    const driver = libsqlDriver({ url });
    const db = driver.getInstance() as Kysely<DB>;

    // Create the backups table directly — no full migrations needed for these
    // tests. Timestamps are TEXT: the table is a `definePlugin` descriptor now,
    // so its columns are ISO-8601 strings, not unix seconds.
    await sql
        .raw(
            `
            CREATE TABLE IF NOT EXISTS plugin_backups_runs (
                id TEXT PRIMARY KEY,
                key TEXT,
                status TEXT NOT NULL,
                trigger TEXT NOT NULL,
                size_bytes INTEGER,
                error TEXT,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                artifact_deleted_at TEXT
            )
        `
        )
        .execute(db);

    return { db, driver };
}

/** Build a minimal PluginContext for the backups plugin. */
function makeCtx(
    db: Kysely<DB>,
    storage: PluginStorage,
    database: PluginDatabase
): PluginContext {
    return {
        // Cast through unknown: the plugin source is being ported to Kysely in a
        // sibling agent; the type will be Kysely<DB> once that lands.
        db: db as unknown as PluginContext['db'],
        plugin: {
            package: '@astromech/backups',
            namespace: 'backups',
            serviceKey: 'backups',
            permissionNamespace: 'backups',
            version: '0.1.0',
        },
        config: null as unknown as PluginContext['config'],
        user: null,
        role: null,
        entries: null as unknown as PluginContext['entries'],
        media: null as unknown as PluginContext['media'],
        settings: null as unknown as PluginContext['settings'],
        users: null as unknown as PluginContext['users'],
        notifications: null as unknown as PluginContext['notifications'],
        sendEmail: async () => undefined,
        logger: {
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
        },
        env: {},
        emit: async () => undefined,
        notify: async () => undefined,
        storage,
        database,
        methods: { tools: () => [] },
    };
}

/**
 * Adapt the filesystem driver to PluginStorage: plugins get the simple
 * all-keys `list`, so the driver's paginated one is followed via `listAll`.
 */
function makeStorage(dir: string): PluginStorage {
    const driver = filesystem({ dir });
    return {
        put: (key, body, opts) => driver.put(key, body, opts),
        get: (key) => driver.get(key),
        delete: (key) => driver.delete(key),
        list: (prefix = '') => listAll(driver, prefix),
    };
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
        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);
        await sql.raw(`INSERT INTO items VALUES ('1','alpha'), ('2','beta')`).execute(db);

        const dump = await driver.dump();
        // Mutate after dump.
        await sql.raw(`DELETE FROM items`).execute(db);
        await sql.raw(`INSERT INTO items VALUES ('3','gamma')`).execute(db);

        const { rows: rowsBefore } = await sql.raw(`SELECT * FROM items`).execute(db);
        expect(rowsBefore).toHaveLength(1);

        await driver.restore(dump.stream, { preserve: [] });
        await dump.cleanup();

        const { rows: rowsAfter } = await sql.raw(`SELECT * FROM items`).execute(db);
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
        await sql.raw(`CREATE TABLE things (id TEXT PRIMARY KEY, val TEXT)`).execute(db);

        await sql.raw(`INSERT INTO things VALUES ('t1','original-thing')`).execute(db);
        await sql
            .raw(
                `INSERT INTO plugin_backups_runs VALUES ('r1',NULL,'success','manual',NULL,NULL,1,NULL,NULL)`
            )
            .execute(db);

        const dump = await driver.dump();

        // Mutate both tables after the dump.
        await sql.raw(`DELETE FROM things`).execute(db);
        await sql.raw(`INSERT INTO things VALUES ('t2','post-dump-thing')`).execute(db);
        await sql.raw(`DELETE FROM plugin_backups_runs`).execute(db);
        await sql
            .raw(
                `INSERT INTO plugin_backups_runs VALUES ('r2',NULL,'failed','scheduled',NULL,'boom',2,NULL,NULL)`
            )
            .execute(db);

        // Restore, preserving plugin_backups_runs.
        await driver.restore(dump.stream, { preserve: ['plugin_backups_runs'] });
        await dump.cleanup();

        // `things` should be reverted to the original state.
        const { rows: things } = await sql.raw(`SELECT * FROM things`).execute(db);
        expect(things).toHaveLength(1);
        expect((things as Record<string, unknown>[])[0]?.['val']).toBe('original-thing');

        // `plugin_backups_runs` should keep the post-dump state.
        const { rows: runs } = await sql
            .raw(`SELECT * FROM plugin_backups_runs`)
            .execute(db);
        expect(runs).toHaveLength(1);
        expect((runs as Record<string, unknown>[])[0]?.['id']).toBe('r2');
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
            await sql
                .raw(
                    `INSERT INTO plugin_backups_runs (id, key, status, trigger, started_at)
                     VALUES ('${id}', '${key}', 'success', 'manual', ${baseTs + i})`
                )
                .execute(db);
        }

        // Verify 5 artifacts exist before rotation.
        const beforeKeys = await storage.list('');
        expect(beforeKeys).toHaveLength(5);

        // Rotate to keep only the 3 newest.
        await rotate(ctx, 3);

        // Check DB rows.
        const { rows: rawRows } = await sql
            .raw(`SELECT * FROM plugin_backups_runs`)
            .execute(db);
        const allRows = (rawRows as Record<string, unknown>[]).map((r) =>
            decodeWith(backupRunsTable, r)
        );
        const deleted = allRows.filter((r) => r['artifactDeletedAt'] !== null);
        const kept = allRows.filter((r) => r['artifactDeletedAt'] === null);

        expect(deleted).toHaveLength(2);
        expect(kept).toHaveLength(3);

        // The oldest 2 rows (lowest startedAt) must be marked deleted.
        const sortedByStart = [...allRows].sort(
            (a, b) =>
                ((a['startedAt'] as Date | null)?.getTime() ?? 0) -
                ((b['startedAt'] as Date | null)?.getTime() ?? 0)
        );
        expect(sortedByStart[0]?.['artifactDeletedAt']).toBeInstanceOf(Date);
        expect(sortedByStart[1]?.['artifactDeletedAt']).toBeInstanceOf(Date);
        expect(sortedByStart[2]?.['artifactDeletedAt']).toBeNull();

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

        const { rows: rawRows } = await sql
            .raw(`SELECT * FROM plugin_backups_runs`)
            .execute(db);
        const allRows = (rawRows as Record<string, unknown>[]).map((r) =>
            decodeWith(backupRunsTable, r)
        );
        expect(allRows.every((r) => r['artifactDeletedAt'] === null)).toBe(true);

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
