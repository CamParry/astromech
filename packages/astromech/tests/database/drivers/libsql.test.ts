/**
 * The libsql driver's local/remote classification, which the CLI reads to
 * decide whether a command needs `--allow-remote`, the Kysely adapter each
 * kind of database gets, and the rules `restore` holds a backup to. The
 * restore cases run the driver's real `dump` and `restore` on the harness's
 * file database.
 */

import type { DbDump } from '@/types/config';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDb } from '@tests/harness';
import { sql } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import { getDatabaseDriverOrThrow } from '@/database/driver-registry';
import { libsql } from '@/database/drivers/libsql';

const originalUrl = process.env.DATABASE_URL;

afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
});

describe('libsql isRemote', () => {
    it('treats an in-memory database as local', () => {
        expect(libsql({ url: ':memory:' }).isRemote()).toBe(false);
    });

    it('treats a scheme-less path as local', () => {
        expect(libsql({ url: './dev.db' }).isRemote()).toBe(false);
    });

    it('treats a `file:` url as local', () => {
        expect(libsql({ url: 'file:./dev.db' }).isRemote()).toBe(false);
    });

    it('treats a libsql or https server url as remote', () => {
        expect(libsql({ url: 'libsql://db.turso.io' }).isRemote()).toBe(true);
        expect(libsql({ url: 'https://db.turso.io' }).isRemote()).toBe(true);
    });

    it('reads DATABASE_URL when no url is passed', () => {
        process.env.DATABASE_URL = 'libsql://db.turso.io';
        expect(libsql().isRemote()).toBe(true);

        process.env.DATABASE_URL = ':memory:';
        expect(libsql().isRemote()).toBe(false);
    });
});

describe('libsql adapter', () => {
    it('runs one query at a time on a local database', () => {
        const { adapter } = libsql({ url: ':memory:' }).getInstance().getExecutor();
        expect(adapter.supportsMultipleConnections).toBe(false);
    });

    it('lets Kysely run queries side by side on a remote database', () => {
        const { adapter } = libsql({ url: 'https://db.turso.io' })
            .getInstance()
            .getExecutor();
        expect(adapter.supportsMultipleConnections).toBe(true);
    });

    it.each([':memory:', 'https://db.turso.io'])(
        'reports transactional DDL on %s, so a migration run is one transaction',
        (url) => {
            const { adapter } = libsql({ url }).getInstance().getExecutor();
            expect(adapter.supportsTransactionalDdl).toBe(true);
        }
    );
});

describe('libsql restore', () => {
    /** The harness database's driver `dump` and `restore`, as boot registers them. */
    function dumpAndRestore(): {
        dump: () => Promise<DbDump>;
        restore: (backup: DbDump) => Promise<void>;
    } {
        const driver = getDatabaseDriverOrThrow();
        if (driver.dump === undefined || driver.restore === undefined) {
            throw new Error('the harness database driver cannot dump and restore');
        }
        const { dump, restore } = driver;
        return { dump, restore: (backup) => restore(backup.stream, { preserve: [] }) };
    }

    // Column order is not part of the schema contract (`DECISIONS.md`): a
    // migrated table and a fresh build can hold the same columns in another
    // order, so the copy matches columns by name.
    it('restores each value into its column when the live table orders them differently', async () => {
        const db = await createTestDb();
        const { dump, restore } = dumpAndRestore();

        await sql
            .raw(`CREATE TABLE items (id TEXT PRIMARY KEY, first TEXT, second TEXT)`)
            .execute(db);
        await sql.raw(`INSERT INTO items VALUES ('1', 'one', 'two')`).execute(db);
        const backup = await dump();

        await sql.raw(`DROP TABLE items`).execute(db);
        await sql
            .raw(`CREATE TABLE items (id TEXT PRIMARY KEY, second TEXT, first TEXT)`)
            .execute(db);

        await restore(backup);
        await backup.cleanup();

        const { rows } = await sql.raw(`SELECT id, first, second FROM items`).execute(db);
        expect(rows).toEqual([{ id: '1', first: 'one', second: 'two' }]);
    });

    it('refuses a backup whose table has other columns than the live one', async () => {
        const db = await createTestDb();
        const { dump, restore } = dumpAndRestore();

        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);
        await sql.raw(`INSERT INTO items VALUES ('1', 'alpha')`).execute(db);
        const backup = await dump();

        await sql.raw(`ALTER TABLE items DROP COLUMN name`).execute(db);
        await sql.raw(`ALTER TABLE items ADD COLUMN label TEXT`).execute(db);

        await expect(restore(backup)).rejects.toThrow(
            'table "items" has other columns in the backup (id, name) than in the database (id, label)'
        );
        await backup.cleanup();

        const { rows } = await sql.raw(`SELECT id, label FROM items`).execute(db);
        expect(rows).toEqual([{ id: '1', label: null }]);
    });

    it('refuses a backup with a table the database does not have', async () => {
        const db = await createTestDb();
        const { dump, restore } = dumpAndRestore();

        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);
        const backup = await dump();
        await sql.raw(`DROP TABLE items`).execute(db);

        await expect(restore(backup)).rejects.toThrow(
            'table "items" is in the backup but not in the database'
        );
        await backup.cleanup();
    });

    // The column check alone passes a backup taken before a migration that
    // created a table: the copy would rewind `kysely_migration`, and the next
    // migration run would fail on the table that already exists.
    it('refuses a backup from another schema version, naming the migrations that differ', async () => {
        const db = await createTestDb();
        const { dump, restore } = dumpAndRestore();
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

        await expect(restore(backup)).rejects.toThrow(
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

    it('refuses a backup that records no migrations into a migrated database', async () => {
        const file = join(tmpdir(), `astromech-libsql-test-${randomUUID()}.db`);
        const driver = libsql({ url: `file:${file}` });
        const db = driver.getInstance();
        try {
            await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY)`).execute(db);
            const backup = await driver.dump();
            await sql
                .raw(
                    `CREATE TABLE kysely_migration (name TEXT PRIMARY KEY, timestamp TEXT)`
                )
                .execute(db);
            await sql
                .raw(`INSERT INTO kysely_migration VALUES ('0001_init', '2026-10-03')`)
                .execute(db);

            await expect(driver.restore(backup.stream, { preserve: [] })).rejects.toThrow(
                'the backup is from another schema version than the database ' +
                    '(migrations only in the database: 0001_init)'
            );
            await backup.cleanup();
        } finally {
            await db.destroy();
            await rm(file, { force: true });
        }
    });
});
