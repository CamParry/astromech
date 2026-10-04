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
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateToLatest } from '@astromech/schema-engine';
import { createTestDb } from '@tests/harness';
import { testMigrationProvider } from '@tests/test-db';
import { sql } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import { getDatabaseDriverOrThrow } from '@/database/driver-registry';
import { libsql } from '@/database/drivers/libsql';
import { InvalidBackupError, RestoreRefusedError } from '@/database/errors';

const originalUrl = process.env.DATABASE_URL;

afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
});

describe('libsql', () => {
    it('names itself, as every driver does', () => {
        expect(libsql({ url: ':memory:' }).name).toBe('libsql');
    });
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
            options?: {
                preserve?: string[];
                empty?: string[];
                migrations?: MigrationProvider;
            }
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
                    empty: options.empty ?? [],
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

        const error = await restore(backup).catch((thrown: unknown) => thrown);
        await backup.cleanup();

        expect(error).toBeInstanceOf(RestoreRefusedError);
        expect(error).toMatchObject({
            message:
                'table "items" has other columns in the backup (id, name) than in the ' +
                'database (id, label), though both record the same migrations',
            details: { table: 'items' },
        });

        const { rows } = await sql.raw(`SELECT id, label FROM items`).execute(db);
        expect(rows).toEqual([{ id: '1', label: null }]);
    });

    it('refuses a backup with a table the database does not have', async () => {
        const db = await createTestDb();
        const { dump, restore } = dumpAndRestore();

        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);
        const backup = await dump();
        await sql.raw(`DROP TABLE items`).execute(db);

        const error = await restore(backup).catch((thrown: unknown) => thrown);
        await backup.cleanup();

        expect(error).toBeInstanceOf(RestoreRefusedError);
        expect(error).toMatchObject({
            message:
                'table "items" is in the backup but not in the database, though both ' +
                'record the same migrations',
            details: { table: 'items' },
        });
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
        // Fails only on the backup's data, as a migration that assumes a
        // cleanup the live database has had would.
        const failsOnAlpha: Migration = {
            async up(migrating) {
                const { rows } =
                    await sql`SELECT 1 FROM items WHERE name = 'alpha'`.execute(
                        migrating
                    );
                if (rows.length > 0) throw new Error('boom');
            },
        };
        const current = chainWith({ '9999_fails': failsOnAlpha });

        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);
        await sql.raw(`INSERT INTO items VALUES ('1', 'alpha')`).execute(db);
        const backup = await dump();
        await sql.raw(`UPDATE items SET name = 'later'`).execute(db);
        await migrateToLatest(db, current, { allowUnorderedMigrations: true });

        await expect(restore(backup, { migrations: current })).rejects.toThrow(
            'the backup could not be brought up to this schema: migration "9999_fails" failed: boom'
        );
        await backup.cleanup();

        const { rows } = await sql.raw(`SELECT name FROM items`).execute(db);
        expect(rows).toEqual([{ name: 'later' }]);
        expect(await recordedMigrations(db, '999%')).toEqual([{ name: '9999_fails' }]);
    });

    it('restores a backup recording the same migrations as the database without loading the chain', async () => {
        const db = await createTestDb();
        const { dump, restore } = dumpAndRestore();
        const unavailable: MigrationProvider = {
            async getMigrations() {
                throw new Error('this runtime ships no migration files');
            },
        };

        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);
        await sql.raw(`INSERT INTO items VALUES ('1', 'alpha')`).execute(db);
        const backup = await dump();
        await sql.raw(`UPDATE items SET name = 'later'`).execute(db);

        await restore(backup, { migrations: unavailable });
        await backup.cleanup();

        const { rows } = await sql.raw(`SELECT name FROM items`).execute(db);
        expect(rows).toEqual([{ name: 'alpha' }]);
    });

    // A preserved table keeps its live rows and an emptied one ends empty, so
    // the backup's rows in them are discarded and must not fail a migration.
    it.each([
        { option: 'preserve', expected: [{ id: '1', name: 'alpha' }] },
        { option: 'empty', expected: [] },
    ])(
        'discards the rows the backup holds in a table to $option before migrating it',
        async ({ option, expected }) => {
            const db = await createTestDb();
            const { dump, restore } = dumpAndRestore();
            const uniqueName: Migration = {
                async up(migrating) {
                    await sql`CREATE UNIQUE INDEX items_name ON items (name)`.execute(
                        migrating
                    );
                },
            };
            const older = chainWith({ '9998_items': createItems });
            const current = chainWith({
                '9998_items': createItems,
                '9999_unique_name': uniqueName,
            });

            await migrateToLatest(db, older, { allowUnorderedMigrations: true });
            await sql
                .raw(`INSERT INTO items (id, name) VALUES ('1', 'alpha'), ('2', 'alpha')`)
                .execute(db);
            const backup = await dump();
            await sql.raw(`DELETE FROM items WHERE id = '2'`).execute(db);
            await migrateToLatest(db, current, { allowUnorderedMigrations: true });

            await restore(backup, { [option]: ['items'], migrations: current });
            await backup.cleanup();

            const { rows } = await sql.raw(`SELECT id, name FROM items`).execute(db);
            expect(rows).toEqual(expected);
            expect(await recordedMigrations(db, '999%')).toEqual([
                { name: '9998_items' },
                { name: '9999_unique_name' },
            ]);
        }
    );

    it('refuses a backup when the database has not applied a migration the site has', async () => {
        const db = await createTestDb();
        const { dump, restore } = dumpAndRestore();
        const indexName: Migration = {
            async up(migrating) {
                await sql`CREATE INDEX items_name ON items (name)`.execute(migrating);
            },
        };
        const applied = chainWith({ '9998_items': createItems });
        const current = chainWith({
            '9998_items': createItems,
            '9999_index_name': indexName,
        });

        const backup = await dump();
        await migrateToLatest(db, applied, { allowUnorderedMigrations: true });
        await sql.raw(`INSERT INTO items (id, name) VALUES ('1', 'alpha')`).execute(db);

        const error = await restore(backup, { migrations: current }).catch(
            (thrown: unknown) => thrown
        );
        await backup.cleanup();

        expect(error).toBeInstanceOf(RestoreRefusedError);
        expect(error).toMatchObject({
            message:
                "the database does not match this site's migrations (not yet applied " +
                'to the database: 9999_index_name, run `astromech db:init`)',
            details: { notApplied: ['9999_index_name'] },
        });
        const { rows } = await sql.raw(`SELECT id, name FROM items`).execute(db);
        expect(rows).toEqual([{ id: '1', name: 'alpha' }]);
        expect(await recordedMigrations(db, '999%')).toEqual([{ name: '9998_items' }]);
    });

    it('refuses a restore that would leave a row pointing at a row the backup lacks', async () => {
        const db = await createTestDb();
        const { dump, restore } = dumpAndRestore();

        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY)`).execute(db);
        await sql.raw(`INSERT INTO items VALUES ('1')`).execute(db);
        const backup = await dump();
        await sql.raw(`INSERT INTO items VALUES ('2')`).execute(db);
        await sql
            .raw(`CREATE TABLE tags (item_id TEXT NOT NULL REFERENCES items (id))`)
            .execute(db);
        await sql.raw(`INSERT INTO tags VALUES ('2')`).execute(db);

        const error = await restore(backup).catch((thrown: unknown) => thrown);
        await backup.cleanup();

        expect(error).toBeInstanceOf(RestoreRefusedError);
        expect(error).toMatchObject({
            message:
                'the restore would leave rows in "tags" pointing at rows "items" no ' +
                'longer holds',
            details: { table: 'tags', parent: 'items' },
        });
        const { rows } = await sql.raw(`SELECT id FROM items ORDER BY id`).execute(db);
        expect(rows).toEqual([{ id: '1' }, { id: '2' }]);
    });

    it('removes its temporary files when the backup stream fails', async () => {
        await createTestDb();
        const driver = getDatabaseDriverOrThrow();
        const dir = await mkdtemp(join(tmpdir(), 'astromech-libsql-test-'));
        const originalTmpdir = process.env.TMPDIR;
        process.env.TMPDIR = dir;
        try {
            const broken = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array([1, 2, 3]));
                    controller.error(new Error('connection reset'));
                },
            });

            await expect(
                driver.restore?.(broken, {
                    preserve: [],
                    empty: [],
                    migrations: testMigrationProvider,
                })
            ).rejects.toThrow('connection reset');

            expect(await readdir(dir)).toEqual([]);
        } finally {
            if (originalTmpdir === undefined) delete process.env.TMPDIR;
            else process.env.TMPDIR = originalTmpdir;
            await rm(dir, { recursive: true, force: true });
        }
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

    /** The backup's bytes as one stream, after `change` has edited them. */
    async function edited(
        backup: DbDump,
        change: (bytes: Uint8Array) => void
    ): Promise<ReadableStream<Uint8Array>> {
        const bytes = new Uint8Array(await new Response(backup.stream).arrayBuffer());
        await backup.cleanup();
        change(bytes);
        return new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(bytes);
                controller.close();
            },
        });
    }

    // A backup that cannot be read as a site's database is the caller's bad
    // input, so it answers 422 rather than a server failure's 500.
    it.each([
        {
            backup: 'is not a SQLite database',
            // Overwrites the file header SQLite opens a database by.
            change: (bytes: Uint8Array) => bytes.fill(0x20, 0, 100),
            message: 'the backup is not a SQLite database',
        },
        {
            backup: 'fails its integrity check',
            // Overwrites the header of the third page, which SQLite reports
            // from the check without failing the query.
            change: (bytes: Uint8Array) => bytes.fill(0xff, 8192, 8292),
            message: 'the backup failed its integrity check',
        },
        {
            backup: 'is too damaged to check',
            // Overwrites the header of every page after the first, which fails
            // the integrity check's own query.
            change: (bytes: Uint8Array) => {
                for (let page = 4096; page < bytes.length; page += 4096) {
                    bytes.fill(0xff, page, page + 100);
                }
            },
            message: 'the backup failed its integrity check',
        },
    ])('refuses a backup that $backup, changing nothing', async ({ change, message }) => {
        const db = await createTestDb();
        const driver = getDatabaseDriverOrThrow();
        await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)`).execute(db);
        await sql.raw(`INSERT INTO items VALUES ('1', 'alpha')`).execute(db);
        const source = await edited(await driver.dump!(), change);
        await sql.raw(`UPDATE items SET name = 'later'`).execute(db);

        const error = await driver.restore!(source, {
            preserve: [],
            empty: [],
            migrations: testMigrationProvider,
        }).catch((thrown: unknown) => thrown);

        expect(error).toBeInstanceOf(InvalidBackupError);
        expect(error).toMatchObject({ message, status: 422, code: 'VALIDATION_FAILED' });
        const { rows } = await sql.raw(`SELECT name FROM items`).execute(db);
        expect(rows).toEqual([{ name: 'later' }]);
    });

    it('refuses a backup that records no migrations', async () => {
        const file = join(tmpdir(), `astromech-libsql-test-${randomUUID()}.db`);
        const driver = libsql({ url: `file:${file}` });
        const db = driver.getInstance();
        try {
            await sql.raw(`CREATE TABLE items (id TEXT PRIMARY KEY)`).execute(db);
            await sql.raw(`INSERT INTO items VALUES ('1')`).execute(db);
            const backup = await driver.dump();

            const error = await driver
                .restore(backup.stream, {
                    preserve: [],
                    empty: [],
                    migrations: testMigrationProvider,
                })
                .catch((thrown: unknown) => thrown);
            await backup.cleanup();

            expect(error).toBeInstanceOf(InvalidBackupError);
            expect(error).toMatchObject({
                message:
                    'the backup records no migrations, so it is not an Astromech database',
                status: 422,
            });

            const { rows } = await sql.raw(`SELECT id FROM items`).execute(db);
            expect(rows).toEqual([{ id: '1' }]);
        } finally {
            await db.destroy();
            await rm(file, { force: true });
        }
    });
});
