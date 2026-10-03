/**
 * Every case runs the registered plugin on the harness database, whose runs
 * table comes from the plugin's migration, with its `ctx` from
 * `createPluginTestApp` and the site's storage on the filesystem driver in a
 * tmpdir. Runs are read back through the plugin's `list` method.
 */

import type { BackupRunRow } from '../src/tables/runs';
import type { JsonObject, PluginContext, PluginStorage } from '@/types/index';
import type { PluginTestApp } from '@tests/plugin-app';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTestConfig } from '@tests/harness';
import { createPluginTestApp } from '@tests/plugin-app';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { libsql } from '@/database/drivers/libsql';
import { createRepository } from '@/database/repository/create-repository';
import { filesystem } from '@/storage/drivers/filesystem';
import { isBackupRunning, performBackup, resolveKeep, rotate } from '../src/backup';
import { backups } from '../src/index';
import { createBackupRunsRepository } from '../src/repository';
import { createBackupsService } from '../src/service/backups';
import { backupRunsTable } from '../src/tables/index';

declare global {
    var __astromechBackupRunning: boolean | undefined;
}

let tmpBase: string;
let app: PluginTestApp<'backups'>;

beforeEach(async () => {
    tmpBase = join(tmpdir(), `astromech-backups-test-${randomUUID()}`);
    const storageDir = join(tmpBase, 'storage');
    await mkdir(storageDir, { recursive: true });
    app = await createPluginTestApp('backups', {
        ...makeTestConfig(),
        storage: filesystem({ dir: storageDir }),
        plugins: [backups()],
    });

    // Reset the in-process backup guard between tests.
    globalThis.__astromechBackupRunning = false;
});

afterEach(async () => {
    globalThis.__astromechBackupRunning = false;
    await rm(tmpBase, { recursive: true, force: true });
});

/** The test database's driver capabilities, as the plugin's `ctx` sees them. */
function databaseCapabilities(): {
    dump: NonNullable<PluginContext['database']['dump']>;
    restore: NonNullable<PluginContext['database']['restore']>;
} {
    const { dump, restore } = app.context().database;
    if (dump === undefined || restore === undefined) {
        throw new Error('the test database cannot dump and restore');
    }
    return { dump, restore };
}

/**
 * Store an artifact and write a successful run for it with a known trigger and
 * `startedAt`, which the plugin's own repository always sets to now.
 */
async function seedRun(
    storage: PluginStorage,
    run: { id: string; trigger: BackupRunRow['trigger']; startedAt: string }
): Promise<void> {
    const key = `${run.id}.sqlite.gz`;
    await storage.put(key, new Uint8Array([0, 1, 2]));
    await createRepository(backupRunsTable, app.db).create({
        id: run.id,
        key,
        status: 'success',
        trigger: run.trigger,
        startedAt: new Date(run.startedAt),
    });
}

/** Each run's id and whether rotation has removed its artifact, newest first. */
async function listedRuns(): Promise<[string, boolean][]> {
    const { runs } = await app.service.list();
    return runs.map((run) => [run.id, run.artifactDeletedAt !== null]);
}

describe('backups.list — output', () => {
    it('drops keys the schema does not name', () => {
        const run = {
            id: 'run_1',
            key: 'backups/run_1.sqlite',
            status: 'success' as const,
            trigger: 'manual' as const,
            sizeBytes: 1024,
            error: null,
            startedAt: new Date('2026-01-01'),
            finishedAt: new Date('2026-01-01'),
            artifactDeletedAt: null,
        };
        const capabilities = { canDump: true, canRestore: false };

        expect(
            createBackupsService(7).list.output.parse({
                runs: [{ ...run, internal: 'x' }],
                capabilities: { ...capabilities, internal: 'x' },
            })
        ).toEqual({ runs: [run], capabilities });
    });
});

describe('libsql.dump / restore', () => {
    it('round-trips a table full of rows', async () => {
        const { db } = app;
        const { dump, restore } = databaseCapabilities();

        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);
        await sql.raw(`INSERT INTO items VALUES ('1','alpha'), ('2','beta')`).execute(db);

        const backup = await dump();
        // Mutate after dump.
        await sql.raw(`DELETE FROM items`).execute(db);
        await sql.raw(`INSERT INTO items VALUES ('3','gamma')`).execute(db);

        const { rows: rowsBefore } = await sql.raw(`SELECT * FROM items`).execute(db);
        expect(rowsBefore).toHaveLength(1);

        await restore(backup.stream, { preserve: [] });
        await backup.cleanup();

        const { rows: rowsAfter } = await sql
            .raw(`SELECT name FROM items ORDER BY name`)
            .execute(db);
        expect(rowsAfter).toHaveLength(2);
        expect(rowsAfter).toEqual([{ name: 'alpha' }, { name: 'beta' }]);
    });

    // Column order is not part of the schema contract (`DECISIONS.md`): a
    // migrated table and a fresh build can hold the same columns in another
    // order, so the copy matches columns by name.
    it('restores each value into its column when the live table orders them differently', async () => {
        const { db } = app;
        const { dump, restore } = databaseCapabilities();

        await sql
            .raw(`CREATE TABLE items (id TEXT PRIMARY KEY, first TEXT, second TEXT)`)
            .execute(db);
        await sql.raw(`INSERT INTO items VALUES ('1', 'one', 'two')`).execute(db);
        const backup = await dump();

        await sql.raw(`DROP TABLE items`).execute(db);
        await sql
            .raw(`CREATE TABLE items (id TEXT PRIMARY KEY, second TEXT, first TEXT)`)
            .execute(db);

        await restore(backup.stream, { preserve: [] });
        await backup.cleanup();

        const { rows } = await sql.raw(`SELECT id, first, second FROM items`).execute(db);
        expect(rows).toEqual([{ id: '1', first: 'one', second: 'two' }]);
    });

    it('refuses a backup whose table has other columns than the live one', async () => {
        const { db } = app;
        const { dump, restore } = databaseCapabilities();

        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);
        await sql.raw(`INSERT INTO items VALUES ('1', 'alpha')`).execute(db);
        const backup = await dump();

        await sql.raw(`ALTER TABLE items DROP COLUMN name`).execute(db);
        await sql.raw(`ALTER TABLE items ADD COLUMN label TEXT`).execute(db);

        await expect(restore(backup.stream, { preserve: [] })).rejects.toThrow(
            'table "items" has other columns in the backup (id, name) than in the database (id, label)'
        );
        await backup.cleanup();

        const { rows } = await sql.raw(`SELECT id, label FROM items`).execute(db);
        expect(rows).toEqual([{ id: '1', label: null }]);
    });

    it('refuses a backup with a table the database does not have', async () => {
        const { db } = app;
        const { dump, restore } = databaseCapabilities();

        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);
        const backup = await dump();
        await sql.raw(`DROP TABLE items`).execute(db);

        await expect(restore(backup.stream, { preserve: [] })).rejects.toThrow(
            'table "items" is in the backup but not in the database'
        );
        await backup.cleanup();
    });

    // The column check alone passes a backup taken before a migration that
    // created a table: the copy would rewind `kysely_migration`, and the next
    // migration run would fail on the table that already exists.
    it('refuses a backup from another schema version, naming the migrations that differ', async () => {
        const { db } = app;
        const { dump, restore } = databaseCapabilities();
        const record = (name: string) =>
            sql`INSERT INTO kysely_migration (name, timestamp) VALUES (${name}, '2026-10-03T00:00:00.000Z')`.execute(
                db
            );

        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);
        await sql.raw(`INSERT INTO items VALUES ('1', 'alpha')`).execute(db);
        await record('9998_backup_only');
        const backup = await dump();

        await sql`DELETE FROM kysely_migration WHERE name = '9998_backup_only'`.execute(
            db
        );
        await sql.raw(`CREATE TABLE later (id TEXT PRIMARY KEY)`).execute(db);
        await record('9999_database_only');
        await sql.raw(`UPDATE items SET name = 'post-dump'`).execute(db);

        await expect(restore(backup.stream, { preserve: [] })).rejects.toThrow(
            'the backup is from another schema version than the database ' +
                '(migrations only in the backup: 9998_backup_only; only in the database: 9999_database_only)'
        );
        await backup.cleanup();

        const { rows: items } = await sql.raw(`SELECT name FROM items`).execute(db);
        expect(items).toEqual([{ name: 'post-dump' }]);
        const { rows: recorded } = await sql
            .raw(`SELECT name FROM kysely_migration WHERE name LIKE '999%'`)
            .execute(db);
        expect(recorded).toEqual([{ name: '9999_database_only' }]);
    });

    it('rolls back every table when one table fails to copy', async () => {
        const { db } = app;
        const { dump, restore } = databaseCapabilities();

        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);
        await sql.raw(`CREATE TABLE things (id TEXT PRIMARY KEY, val TEXT)`).execute(db);
        await sql.raw(`INSERT INTO items VALUES ('1','alpha')`).execute(db);
        await sql.raw(`INSERT INTO things VALUES ('t1','original-thing')`).execute(db);
        const backup = await dump();

        // `items` copies back cleanly, then `things` fails: the backup has two
        // columns and the live table now has three.
        await sql.raw(`UPDATE items SET name = 'post-dump'`).execute(db);
        await sql.raw(`ALTER TABLE things ADD COLUMN extra TEXT`).execute(db);

        await expect(restore(backup.stream, { preserve: [] })).rejects.toThrow('columns');
        await backup.cleanup();

        // The copy runs in one transaction, so `items` is not left restored and
        // `things` is not left empty.
        const { rows: items } = await sql.raw(`SELECT name FROM items`).execute(db);
        expect(items).toEqual([{ name: 'post-dump' }]);
        const { rows: things } = await sql.raw(`SELECT val FROM things`).execute(db);
        expect(things).toEqual([{ val: 'original-thing' }]);
    });

    it('leaves foreign keys on and nothing attached on the driver client', async () => {
        const { db } = app;
        const { dump, restore } = databaseCapabilities();
        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);

        const backup = await dump();
        await restore(backup.stream, { preserve: [] });
        await backup.cleanup();

        const { rows: foreignKeys } = await sql.raw(`PRAGMA foreign_keys`).execute(db);
        expect(foreignKeys.map((row) => Object.values(row as object)[0])).toEqual([1]);
        const { rows: databases } = await sql.raw(`PRAGMA database_list`).execute(db);
        expect(databases.map((row) => (row as Record<string, unknown>)['name'])).toEqual([
            'main',
        ]);
    });

    it('throws a clear error for a non-file: URL on dump', async () => {
        const remoteDriver = libsql({ url: 'libsql://example.turso.io' });
        await expect(remoteDriver.dump()).rejects.toThrow('file:');
    });

    it('throws a clear error for a non-file: URL on restore', async () => {
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

    it('refuses an in-memory database on dump and restore', async () => {
        for (const url of ['file::memory:', 'file::memory:?cache=shared']) {
            const memoryDriver = libsql({ url });
            const emptyStream = new ReadableStream<Uint8Array>({
                start(c) {
                    c.close();
                },
            });
            await expect(memoryDriver.dump()).rejects.toThrow('in-memory');
            await expect(
                memoryDriver.restore(emptyStream, { preserve: [] })
            ).rejects.toThrow('in-memory');
        }
    });
});

describe('libsql.restore — preserve', () => {
    it('keeps preserved tables while reverting the rest', async () => {
        const { db } = app;
        const { dump, restore } = databaseCapabilities();
        const runs = createBackupRunsRepository(db);

        await sql.raw(`CREATE TABLE things (id TEXT PRIMARY KEY, val TEXT)`).execute(db);
        await sql.raw(`INSERT INTO things VALUES ('t1','original-thing')`).execute(db);
        const before = await runs.create('manual');

        const backup = await dump();

        // Mutate both tables after the dump.
        await sql.raw(`DELETE FROM things`).execute(db);
        await sql.raw(`INSERT INTO things VALUES ('t2','post-dump-thing')`).execute(db);
        await runs.delete(before.id);
        const after = await runs.create('scheduled');

        await restore(backup.stream, { preserve: ['plugin_backups_runs'] });
        await backup.cleanup();

        // `things` is reverted to the original state.
        const { rows: things } = await sql.raw(`SELECT * FROM things`).execute(db);
        expect(things).toHaveLength(1);
        expect((things as Record<string, unknown>[])[0]?.['val']).toBe('original-thing');

        // `plugin_backups_runs` keeps the post-dump state.
        const { runs: listed } = await app.service.list();
        expect(listed).toHaveLength(1);
        expect(listed[0]?.id).toBe(after.id);
    });
});

describe('performBackup — success', () => {
    it('creates a gzip artifact in storage and a success run row', async () => {
        const ctx = app.context();
        const { storage } = ctx;

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

describe('performBackup — failure', () => {
    it('marks the run as failed when dump is not supported', async () => {
        // Deliberately omit dump from the database capability.
        const ctx: PluginContext = {
            ...app.context(),
            database: { dialect: 'test-no-dump' },
        };
        const { storage } = ctx;

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
    it('deletes the oldest artifacts when runs exceed keep', async () => {
        const ctx = app.context();
        const { storage } = ctx;

        // Five successful runs a day apart, stored as the ISO text the
        // table's timestamp columns hold.
        await seedRun(storage, {
            id: 'run-1',
            trigger: 'manual',
            startedAt: '2026-01-01T03:00:00.000Z',
        });
        await seedRun(storage, {
            id: 'run-2',
            trigger: 'manual',
            startedAt: '2026-01-02T03:00:00.000Z',
        });
        await seedRun(storage, {
            id: 'run-3',
            trigger: 'manual',
            startedAt: '2026-01-03T03:00:00.000Z',
        });
        await seedRun(storage, {
            id: 'run-4',
            trigger: 'manual',
            startedAt: '2026-01-04T03:00:00.000Z',
        });
        await seedRun(storage, {
            id: 'run-5',
            trigger: 'manual',
            startedAt: '2026-01-05T03:00:00.000Z',
        });
        expect(await storage.list('')).toHaveLength(5);

        // Rotate to keep only the 3 newest.
        await rotate(ctx, 3);

        // The oldest two runs are marked deleted; their rows stay.
        expect(await listedRuns()).toEqual([
            ['run-5', false],
            ['run-4', false],
            ['run-3', false],
            ['run-2', true],
            ['run-1', true],
        ]);
        expect(await storage.list('')).toHaveLength(3);
    });

    it('is a no-op when runs are within keep limit', async () => {
        const ctx = app.context();
        const { storage } = ctx;

        await performBackup(ctx, 'manual', { keep: 99 });
        await performBackup(ctx, 'manual', { keep: 99 });

        await rotate(ctx, 5);

        const { runs } = await app.service.list();
        expect(runs).toHaveLength(2);
        expect(runs.every((run) => run.artifactDeletedAt === null)).toBe(true);
        expect(await storage.list('')).toHaveLength(2);
    });
});

describe('rotate — pre-restore snapshots', () => {
    it('neither rotates a pre-restore snapshot nor counts it against keep', async () => {
        const ctx = app.context();
        const { storage } = ctx;

        // Two pre-restore snapshots interleaved with three scheduled runs. With
        // pre-restore counted, keep=3 would delete two scheduled backups.
        await seedRun(storage, {
            id: 'a-scheduled-1',
            trigger: 'scheduled',
            startedAt: '2026-01-01T03:00:00.000Z',
        });
        await seedRun(storage, {
            id: 'b-pre-restore-1',
            trigger: 'pre-restore',
            startedAt: '2026-01-02T09:00:00.000Z',
        });
        await seedRun(storage, {
            id: 'c-scheduled-2',
            trigger: 'scheduled',
            startedAt: '2026-01-03T03:00:00.000Z',
        });
        await seedRun(storage, {
            id: 'd-pre-restore-2',
            trigger: 'pre-restore',
            startedAt: '2026-01-04T09:00:00.000Z',
        });
        await seedRun(storage, {
            id: 'e-scheduled-3',
            trigger: 'scheduled',
            startedAt: '2026-01-05T03:00:00.000Z',
        });

        await rotate(ctx, 3);

        expect(await listedRuns()).toEqual([
            ['e-scheduled-3', false],
            ['d-pre-restore-2', false],
            ['c-scheduled-2', false],
            ['b-pre-restore-1', false],
            ['a-scheduled-1', false],
        ]);
        expect(await storage.list('')).toHaveLength(5);

        // Tightening to keep=2 drops the oldest scheduled run only.
        await rotate(ctx, 2);

        expect(await listedRuns()).toEqual([
            ['e-scheduled-3', false],
            ['d-pre-restore-2', false],
            ['c-scheduled-2', false],
            ['b-pre-restore-1', false],
            ['a-scheduled-1', true],
        ]);
        expect(await storage.list('')).toHaveLength(4);
    });

    it('breaks a startedAt tie on id, so ordering is total', async () => {
        const ctx = app.context();
        const { storage } = ctx;

        // Same millisecond for all three — only the (ULID) id can order them.
        const sameInstant = '2026-01-01T03:00:00.000Z';
        for (const id of ['01JC000000000000000000000A', '01JC000000000000000000000B']) {
            await seedRun(storage, { id, trigger: 'scheduled', startedAt: sameInstant });
        }
        await seedRun(storage, {
            id: '01JC000000000000000000000C',
            trigger: 'scheduled',
            startedAt: sameInstant,
        });

        await rotate(ctx, 1);

        const { runs } = await app.service.list();
        expect(
            runs.filter((run) => run.artifactDeletedAt === null).map((run) => run.id)
        ).toEqual(['01JC000000000000000000000C']);
    });
});

describe('isBackupRunning / in-process guard', () => {
    it('returns false when no backup is running', () => {
        globalThis.__astromechBackupRunning = false;
        expect(isBackupRunning()).toBe(false);
    });

    it('returns true while a backup is in flight', async () => {
        const base = app.context();
        const { dump } = databaseCapabilities();

        // Intercept dump to check the flag mid-flight.
        let flagDuringDump = false;
        const ctx: PluginContext = {
            ...base,
            database: {
                ...base.database,
                dump: async () => {
                    flagDuringDump = isBackupRunning();
                    return dump();
                },
            },
        };
        await performBackup(ctx, 'manual', { keep: 10 });

        expect(flagDuringDump).toBe(true);
    });

    it('returns false again after the backup completes', async () => {
        await performBackup(app.context(), 'manual', { keep: 10 });

        expect(isBackupRunning()).toBe(false);
    });

    it('returns false after a failed backup', async () => {
        const ctx: PluginContext = {
            ...app.context(),
            database: { dialect: 'test-no-dump' },
        };
        await performBackup(ctx, 'manual', { keep: 10 });

        expect(isBackupRunning()).toBe(false);
    });
});

describe('resolveKeep', () => {
    /** Save the plugin's settings global through the real globals service. */
    async function saveSettings(fields: JsonObject): Promise<void> {
        await app.globals.update({ key: 'backups/settings', data: { fields } });
    }

    it('reads retention out of the settings global', async () => {
        await saveSettings({ retention: 3 });

        expect(await resolveKeep(app.context(), 7)).toBe(3);
    });

    it('reads the key the plugin’s settings global actually writes', () => {
        const settingsGlobal = app.adminConfig.globals['backups/settings'];

        // The retention field is reachable, and it lands on the key resolveKeep
        // asks for (asserted in the test above).
        expect(settingsGlobal).toBeDefined();
        expect(settingsGlobal?.plugin).toBe('backups');
        expect(settingsGlobal?.fields.main.map((field) => field.name)).toEqual([
            'retention',
        ]);
    });

    it('falls back when the global is unsaved', async () => {
        expect(await resolveKeep(app.context(), 7)).toBe(7);
    });

    it.each<[string, JsonObject]>([
        ['nothing', {}],
        ['a null retention', { retention: null }],
        ['a zero retention', { retention: 0 }],
        ['a negative retention', { retention: -1 }],
    ])('falls back when the global holds %s', async (_name, fields) => {
        await saveSettings(fields);

        expect(await resolveKeep(app.context(), 7)).toBe(7);
    });

    it('falls back when the stored retention is not a number', async () => {
        // The number field refuses a string, so put one in the table the way a
        // value saved under an older field definition would sit there.
        await saveSettings({ retention: 3 });
        await sql`UPDATE global_content SET fields = json_set(fields, '$.retention', 'lots')`.execute(
            app.db
        );

        expect(await resolveKeep(app.context(), 7)).toBe(7);
    });

    it('floors a fractional retention value', async () => {
        await saveSettings({ retention: 4.8 });

        expect(await resolveKeep(app.context(), 7)).toBe(4);
    });

    it('falls back when the globals service throws', async () => {
        const ctx = app.context();
        vi.spyOn(ctx.globals, 'get').mockRejectedValue(new Error('no globals here'));

        expect(await resolveKeep(ctx, 7)).toBe(7);
    });
});
