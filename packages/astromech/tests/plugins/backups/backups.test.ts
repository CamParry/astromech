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
 *  7. resolveKeep — the retention global overrides the configured keep
 */

import type { DB } from '@/database/types';
import type {
    JsonObject,
    PluginContext,
    PluginDatabase,
    PluginStorage,
} from '@/types/index';
import type { Kysely } from 'kysely';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backups } from '@astromech/backups';
import {
    isBackupRunning,
    performBackup,
    resolveKeep,
    rotate,
} from '@astromech/backups/internals';
import { backupRunsTable } from '@astromech/backups/tables';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodeWith } from '@/database/codec';
import { libsql } from '@/database/drivers/libsql';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';
import { filesystem } from '@/storage/drivers/filesystem';
import { listAll } from '@/storage/prefix';

declare global {
    var __astromechBackupRunning: boolean | undefined;
}

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
    driver: ReturnType<typeof libsql>;
}> {
    const url = `file:${dbPath}`;
    const driver = libsql({ url });
    const db = driver.getInstance() as Kysely<DB>;

    // Create the backups table directly — no full migrations needed for these
    // tests. Timestamps are TEXT: the table is a `definePlugin` table now,
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
        globals: null as unknown as PluginContext['globals'],
        media: null as unknown as PluginContext['media'],
        settings: null as unknown as PluginContext['settings'],
        users: null as unknown as PluginContext['users'],
        notifications: null as unknown as PluginContext['notifications'],
        email: { send: async () => undefined },
        logger: {
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
        },
        env: {},
        runHook: async (_event, payload) => payload,
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

describe('libsql.dump / restore', () => {
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
        const remoteDriver = libsql({ url: 'libsql://example.turso.io' });
        await expect(remoteDriver.dump()).rejects.toThrow('file:');
    });

    it('should throw a clear error for a non-file: URL on restore', async () => {
        const remoteDriver = libsql({ url: 'libsql://example.turso.io' });
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

describe('libsql.restore — preserve', () => {
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

// 4. performBackup — failure path (no dump capability)

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

describe('rotate — pre-restore snapshots', () => {
    /** Insert a success row with an explicit trigger, id and ISO startedAt. */
    async function seedRun(
        db: Kysely<DB>,
        storage: PluginStorage,
        run: { id: string; trigger: string; startedAt: string }
    ): Promise<void> {
        const key = `${run.id}.sqlite.gz`;
        await storage.put(key, new Uint8Array([0, 1, 2]));
        await sql
            .raw(
                `INSERT INTO plugin_backups_runs (id, key, status, trigger, started_at)
                 VALUES ('${run.id}', '${key}', 'success', '${run.trigger}', '${run.startedAt}')`
            )
            .execute(db);
    }

    async function liveKeys(db: Kysely<DB>): Promise<string[]> {
        const { rows } = await sql
            .raw(
                `SELECT id FROM plugin_backups_runs WHERE artifact_deleted_at IS NULL ORDER BY id`
            )
            .execute(db);
        return (rows as Record<string, unknown>[]).map((r) => r['id'] as string);
    }

    it('should neither rotate a pre-restore snapshot nor count it against keep', async () => {
        const { db, driver } = await makeFileDb(dbPath);
        const storage = makeStorage(storageDir);
        const ctx = makeCtx(db, storage, {
            dialect: 'libsql',
            dump: () => driver.dump(),
        });

        // Two pre-restore snapshots interleaved with three scheduled runs. With
        // pre-restore counted, keep=3 would delete two scheduled backups.
        await seedRun(db, storage, {
            id: 'a-scheduled-1',
            trigger: 'scheduled',
            startedAt: '2026-01-01T03:00:00.000Z',
        });
        await seedRun(db, storage, {
            id: 'b-pre-restore-1',
            trigger: 'pre-restore',
            startedAt: '2026-01-02T09:00:00.000Z',
        });
        await seedRun(db, storage, {
            id: 'c-scheduled-2',
            trigger: 'scheduled',
            startedAt: '2026-01-03T03:00:00.000Z',
        });
        await seedRun(db, storage, {
            id: 'd-pre-restore-2',
            trigger: 'pre-restore',
            startedAt: '2026-01-04T09:00:00.000Z',
        });
        await seedRun(db, storage, {
            id: 'e-scheduled-3',
            trigger: 'scheduled',
            startedAt: '2026-01-05T03:00:00.000Z',
        });

        await rotate(ctx, 3);

        expect(await liveKeys(db)).toEqual([
            'a-scheduled-1',
            'b-pre-restore-1',
            'c-scheduled-2',
            'd-pre-restore-2',
            'e-scheduled-3',
        ]);
        expect(await storage.list('')).toHaveLength(5);

        // Tightening to keep=2 drops the oldest scheduled run only.
        await rotate(ctx, 2);

        expect(await liveKeys(db)).toEqual([
            'b-pre-restore-1',
            'c-scheduled-2',
            'd-pre-restore-2',
            'e-scheduled-3',
        ]);
        expect(await storage.list('')).toHaveLength(4);
    });

    it('should break a startedAt tie on id, so ordering is total', async () => {
        const { db, driver } = await makeFileDb(dbPath);
        const storage = makeStorage(storageDir);
        const ctx = makeCtx(db, storage, {
            dialect: 'libsql',
            dump: () => driver.dump(),
        });

        // Same millisecond for all three — only the (ULID) id can order them.
        const sameInstant = '2026-01-01T03:00:00.000Z';
        for (const id of ['01JC000000000000000000000A', '01JC000000000000000000000B']) {
            await seedRun(db, storage, {
                id,
                trigger: 'scheduled',
                startedAt: sameInstant,
            });
        }
        await seedRun(db, storage, {
            id: '01JC000000000000000000000C',
            trigger: 'scheduled',
            startedAt: sameInstant,
        });

        await rotate(ctx, 1);

        expect(await liveKeys(db)).toEqual(['01JC000000000000000000000C']);
    });
});

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

describe('resolveKeep', () => {
    /**
     * A ctx whose globals service answers with one global, and records the key
     * it was asked for.
     */
    async function ctxWithGlobal(
        fields: JsonObject | null
    ): Promise<{ ctx: PluginContext; keys: string[] }> {
        const { db } = await makeFileDb(dbPath);
        const storage = makeStorage(storageDir);
        const ctx = makeCtx(db, storage, { dialect: 'test-no-dump' });
        const keys: string[] = [];
        ctx.globals = {
            get: async (params: { key: string }) => {
                keys.push(params.key);
                return fields === null ? null : { fields };
            },
        } as unknown as PluginContext['globals'];
        return { ctx, keys };
    }

    it('should read retention out of the settings global', async () => {
        const { ctx, keys } = await ctxWithGlobal({ retention: 3 });
        expect(await resolveKeep(ctx, 7)).toBe(3);
        expect(keys).toEqual(['backups/settings']);
    });

    it('should read the key the plugin’s settings global actually writes', async () => {
        const definition = backups();
        const settingsGlobal = definition.globals?.find(
            (global) => global.key === 'settings'
        );

        // The retention field is reachable, and it lands on the key resolveKeep
        // asks for (asserted in the test above).
        expect(settingsGlobal).toBeDefined();
        expect(resolvePluginIdentity(definition).namespace).toBe('backups');
        expect(
            (settingsGlobal?.fields as { name: string }[]).map((field) => field.name)
        ).toEqual(['retention']);
    });

    it('should fall back when the global is absent, empty or not positive', async () => {
        const rows: (JsonObject | null)[] = [
            null,
            {},
            { retention: null },
            { retention: 0 },
            { retention: -1 },
            { retention: 'lots' },
        ];
        for (const fields of rows) {
            const { ctx } = await ctxWithGlobal(fields);
            expect(await resolveKeep(ctx, 7)).toBe(7);
        }
    });

    it('should floor a fractional retention value', async () => {
        const { ctx } = await ctxWithGlobal({ retention: 4.8 });
        expect(await resolveKeep(ctx, 7)).toBe(4);
    });

    it('should fall back when the globals service throws', async () => {
        const { ctx } = await ctxWithGlobal(null);
        ctx.globals = {
            get: async () => {
                throw new Error('no globals here');
            },
        } as unknown as PluginContext['globals'];
        expect(await resolveKeep(ctx, 7)).toBe(7);
    });
});
