/**
 * The libsql driver's local/remote classification, which the CLI reads to
 * decide whether a command needs `--allow-remote`, the Kysely adapter each
 * kind of database gets, and the rules `restore` holds a backup to. The
 * restore cases run the driver's real `dump` and `restore` on the harness's
 * file database.
 */

import type { DB } from '@/database/types';
import type { DbDump } from '@/types/config';
import type { Kysely } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely/migration';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateToLatest } from '@astromech/schema-engine';
import { createTestDb } from '@tests/harness';
import { testMigrationProvider } from '@tests/test-db';
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
    /**
     * The harness database's driver `dump` and `restore`, as boot registers them,
     * restoring against the harness's migration chain unless a test names another.
     */
    function dumpAndRestore(): {
        dump: () => Promise<DbDump>;
        restore: (
            backup: DbDump,
            options?: { preserve?: string[]; migrations?: MigrationProvider }
        ) => Promise<void>;
    } {
        const driver = getDatabaseDriverOrThrow();
        if (driver.dump === undefined || driver.restore === undefined) {
            throw new Error('the harness database driver cannot dump and restore');
        }
        const { dump, restore } = driver;
        return {
            dump,
            restore: (backup, options = {}) =>
                restore(backup.stream, {
                    preserve: options.preserve ?? [],
                    empty: [],
                    migrations: options.migrations ?? testMigrationProvider,
                }),
        };
    }

    /** The harness's chain with `extra` migrations added. */
    function chainWith(extra: Record<string, Migration>): MigrationProvider {
        return {
            async getMigrations() {
                return { ...(await testMigrationProvider.getMigrations()), ...extra };
            },
        };
    }

    const createItems: Migration = {
        async up(db) {
            await sql`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL)`.execute(
                db
            );
        },
    };

    /** Adds `items.label` and fills it from each row's `name`. */
    const addItemLabel: Migration = {
        async up(db) {
            await sql`ALTER TABLE items ADD COLUMN label TEXT`.execute(db);
            await sql`UPDATE items SET label = upper(name)`.execute(db);
        },
    };

    async function recordedMigrations(db: Kysely<DB>, like: string): Promise<unknown[]> {
        const { rows } =
            await sql`SELECT name FROM kysely_migration WHERE name LIKE ${like} ORDER BY name`.execute(
                db
            );
        return rows;
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

    it('runs the migrations an older backup lacks on it, then restores its migrated rows', async () => {
        const db = await createTestDb();
        const { dump, restore } = dumpAndRestore();
        const older = chainWith({ '9998_items': createItems });
        const current = chainWith({
            '9998_items': createItems,
            '9999_item_label': addItemLabel,
        });

        await migrateToLatest(db, older, { allowUnorderedMigrations: true });
        await sql.raw(`INSERT INTO items (id, name) VALUES ('1', 'alpha')`).execute(db);
        const backup = await dump();
        await migrateToLatest(db, current, { allowUnorderedMigrations: true });
        await sql.raw(`UPDATE items SET name = 'later', label = 'LATER'`).execute(db);

        await restore(backup, { migrations: current });
        await backup.cleanup();

        const { rows } = await sql.raw(`SELECT id, name, label FROM items`).execute(db);
        expect(rows).toEqual([{ id: '1', name: 'alpha', label: 'ALPHA' }]);
        expect(await recordedMigrations(db, '999%')).toEqual([
            { name: '9998_items' },
            { name: '9999_item_label' },
        ]);
    });

    it('leaves the database untouched when a migration fails on the backup', async () => {
        const db = await createTestDb();
        const { dump, restore } = dumpAndRestore();
        const failing: Migration = {
            async up() {
                throw new Error('boom');
            },
        };

        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);
        await sql.raw(`INSERT INTO items VALUES ('1', 'alpha')`).execute(db);
        const backup = await dump();
        await sql.raw(`UPDATE items SET name = 'later'`).execute(db);

        await expect(
            restore(backup, { migrations: chainWith({ '9999_fails': failing }) })
        ).rejects.toThrow(
            'the backup could not be brought up to this schema: migration "9999_fails" failed: boom'
        );
        await backup.cleanup();

        const { rows } = await sql.raw(`SELECT name FROM items`).execute(db);
        expect(rows).toEqual([{ name: 'later' }]);
        expect(await recordedMigrations(db, '999%')).toEqual([]);
    });

    // Kysely refuses a ledger row with no matching migration, and a newer
    // backup's schema is one this code cannot read. A removed plugin's and a
    // rebaselined chain's migrations are refused the same way.
    it('refuses a backup holding migrations the code does not have, naming them', async () => {
        const db = await createTestDb();
        const { dump, restore } = dumpAndRestore();
        const record = (name: string) =>
            sql`INSERT INTO kysely_migration (name, timestamp) VALUES (${name}, '2026-10-03T00:00:00.000Z')`.execute(
                db
            );

        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);
        await sql.raw(`INSERT INTO items VALUES ('1', 'alpha')`).execute(db);
        await record('9998_newer');
        await record('9999_newer');
        const backup = await dump();
        await sql`DELETE FROM kysely_migration WHERE name LIKE '999%'`.execute(db);
        await sql.raw(`UPDATE items SET name = 'later'`).execute(db);

        await expect(restore(backup)).rejects.toThrow(
            'the backup records migrations this site does not have (9998_newer, ' +
                '9999_newer): restore it with the code and plugins that wrote it'
        );
        await backup.cleanup();

        const { rows } = await sql.raw(`SELECT name FROM items`).execute(db);
        expect(rows).toEqual([{ name: 'later' }]);
        expect(await recordedMigrations(db, '999%')).toEqual([]);
    });

    it('refuses a backup that records no migrations', async () => {
        const file = join(tmpdir(), `astromech-libsql-test-${randomUUID()}.db`);
        const driver = libsql({ url: `file:${file}` });
        const db = driver.getInstance();
        try {
            await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY)`).execute(db);
            await sql.raw(`INSERT INTO items VALUES ('1')`).execute(db);
            const backup = await driver.dump();

            await expect(
                driver.restore(backup.stream, {
                    preserve: [],
                    empty: [],
                    migrations: testMigrationProvider,
                })
            ).rejects.toThrow(
                'the backup records no migrations, so it is not an Astromech database'
            );
            await backup.cleanup();

            const { rows } = await sql.raw(`SELECT id FROM items`).execute(db);
            expect(rows).toEqual([{ id: '1' }]);
        } finally {
            await db.destroy();
            await rm(file, { force: true });
        }
    });
});
