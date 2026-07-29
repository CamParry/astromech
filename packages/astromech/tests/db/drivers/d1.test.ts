/**
 * Tests the D1 dialect/driver against a fake `D1DatabaseLike` backed by a real
 * libsql file database, so the generated SQL genuinely executes rather than
 * being mocked away. File-backed rather than `:memory:` — see the comment at
 * the top of `tests/_support/harness.ts` for why `:memory:` poisons anything
 * that reopens a connection.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type Client, type InValue } from '@libsql/client';
import { sql, type Kysely, type MigrationProvider } from 'kysely';
import { migrateToLatest } from '@astromech/schema-engine';
import { d1 } from '@/database/drivers/d1.js';
import type {
    D1DatabaseLike,
    D1PreparedStatementLike,
    D1ResultLike,
} from '@/database/drivers/d1-dialect.js';
import { resetBindingEnv, setBindingEnv } from '@/cloudflare/bindings.js';

// ---------------------------------------------------------------------------
// Fake D1Database — real SQLite underneath via libsql, D1 result shape on top
// ---------------------------------------------------------------------------

/** Test-only schema; deliberately unrelated to the app's `DB` type. */
type TestSchema = {
    crud_test: { id: string; name: string; count: number };
    meta_test: { id: string; name: string; count: number };
    binding_test: { id: string; label: string };
    migration_test: { id: string; label: string };
};

function makeFakeD1(client: Client): D1DatabaseLike {
    function statement(sqlText: string, args: unknown[]): D1PreparedStatementLike {
        return {
            bind(...values: unknown[]): D1PreparedStatementLike {
                return statement(sqlText, values);
            },
            async all<T>(): Promise<D1ResultLike<T>> {
                const result = await client.execute({
                    sql: sqlText,
                    args: args as InValue[],
                });
                // libsql rows are both array- and name-indexed; Kysely needs
                // clean plain objects keyed by column name.
                const results = result.rows.map((row) => {
                    const plain: Record<string, unknown> = {};
                    for (const column of result.columns) {
                        plain[column] = row[column];
                    }
                    return plain;
                }) as T[];

                return {
                    results,
                    success: true,
                    meta: {
                        changes: result.rowsAffected,
                        last_row_id:
                            result.lastInsertRowid !== undefined
                                ? Number(result.lastInsertRowid)
                                : null,
                    },
                };
            },
        };
    }

    return {
        prepare(query: string): D1PreparedStatementLike {
            return statement(query, []);
        },
        async batch<T>(): Promise<D1ResultLike<T>[]> {
            throw new Error('batch() is unused by these tests');
        },
    };
}

// ---------------------------------------------------------------------------
// Shared fixture: one file-backed libsql db behind the fake for the whole file
// ---------------------------------------------------------------------------

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'astromech-d1-test-'));
let client: Client;
let fakeDb: D1DatabaseLike;

beforeAll(() => {
    const dbPath = path.join(TMP_DIR, `${randomUUID()}.db`);
    client = createClient({ url: `file:${dbPath}` });
    fakeDb = makeFakeD1(client);
});

afterAll(() => {
    client.close();
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

afterEach(() => {
    resetBindingEnv();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('d1()', () => {
    it('getInstance() is synchronous and does not resolve the binding', () => {
        resetBindingEnv();
        expect(() => d1({ binding: 'NOPE' }).getInstance()).not.toThrow();
    });

    it('declares supportsTransactions: false and omits dump/restore', () => {
        const driver = d1({ database: fakeDb });
        expect(driver.supportsTransactions).toBe(false);
        expect('dump' in driver).toBe(false);
        expect('restore' in driver).toBe(false);
    });

    it('performs a full CRUD round-trip through Kysely', async () => {
        const db = d1({
            database: fakeDb,
        }).getInstance() as unknown as Kysely<TestSchema>;
        await sql`CREATE TABLE crud_test (id TEXT PRIMARY KEY, name TEXT NOT NULL, count INTEGER NOT NULL)`.execute(
            db
        );

        await db
            .insertInto('crud_test')
            .values({ id: 'a', name: 'alpha', count: 1 })
            .execute();

        const created = await db
            .selectFrom('crud_test')
            .selectAll()
            .where('id', '=', 'a')
            .executeTakeFirst();
        expect(created).toEqual({ id: 'a', name: 'alpha', count: 1 });

        await db
            .updateTable('crud_test')
            .set({ count: 2 })
            .where('id', '=', 'a')
            .execute();
        const updated = await db
            .selectFrom('crud_test')
            .selectAll()
            .where('id', '=', 'a')
            .executeTakeFirst();
        expect(updated?.count).toBe(2);

        await db.deleteFrom('crud_test').where('id', '=', 'a').execute();
        const deleted = await db
            .selectFrom('crud_test')
            .selectAll()
            .where('id', '=', 'a')
            .executeTakeFirst();
        expect(deleted).toBeUndefined();
    });

    it('maps insertId and numAffectedRows from D1 meta', async () => {
        const db = d1({
            database: fakeDb,
        }).getInstance() as unknown as Kysely<TestSchema>;
        await sql`CREATE TABLE meta_test (id TEXT PRIMARY KEY, name TEXT NOT NULL, count INTEGER NOT NULL)`.execute(
            db
        );

        const inserted = await db
            .insertInto('meta_test')
            .values({ id: 'm1', name: 'meta', count: 1 })
            .executeTakeFirst();
        // `meta_test` has a text PK but SQLite still assigns an implicit rowid.
        expect(typeof inserted?.insertId).toBe('bigint');

        const updateResult = await db
            .updateTable('meta_test')
            .set({ count: 9 })
            .where('id', '=', 'm1')
            .executeTakeFirst();
        expect(updateResult?.numUpdatedRows).toBe(1n);

        const deleteResult = await db
            .deleteFrom('meta_test')
            .where('id', '=', 'm1')
            .executeTakeFirst();
        expect(deleteResult?.numDeletedRows).toBe(1n);
    });

    it('rejects db.transaction() with the branded no-interactive-transactions error', async () => {
        const db = d1({ database: fakeDb }).getInstance();
        await expect(db.transaction().execute(async () => 'never')).rejects.toThrow(
            /no interactive transactions/i
        );
    });

    describe('binding form', () => {
        it('round-trips through Kysely against a database supplied via setBindingEnv', async () => {
            setBindingEnv({ DB: fakeDb });
            const db = d1({
                binding: 'DB',
            }).getInstance() as unknown as Kysely<TestSchema>;

            await sql`CREATE TABLE binding_test (id TEXT PRIMARY KEY, label TEXT NOT NULL)`.execute(
                db
            );
            await db
                .insertInto('binding_test')
                .values({ id: 'b1', label: 'bound' })
                .execute();
            const row = await db
                .selectFrom('binding_test')
                .selectAll()
                .where('id', '=', 'b1')
                .executeTakeFirst();
            expect(row?.label).toBe('bound');
        });

        it('resolves the binding once across several queries', async () => {
            let resolutions = 0;
            const env: Record<string, unknown> = {};
            Object.defineProperty(env, 'DB', {
                enumerable: true,
                get() {
                    resolutions++;
                    return fakeDb;
                },
            });
            setBindingEnv(env);

            const db = d1({
                binding: 'DB',
            }).getInstance() as unknown as Kysely<TestSchema>;
            await sql`SELECT 1`.execute(db);
            await sql`SELECT 1`.execute(db);
            await sql`SELECT 1`.execute(db);

            expect(resolutions).toBe(1);
        });

        it('does not memoise a failed lookup, so a later env still resolves', async () => {
            resetBindingEnv();
            setBindingEnv({ OTHER: fakeDb });
            const driver = d1({ binding: 'MISSING' });
            const db = driver.getInstance();
            await expect(sql`SELECT 1`.execute(db)).rejects.toThrow(/not found/);

            resetBindingEnv();
            setBindingEnv({ MISSING: fakeDb });
            await expect(sql`SELECT 1`.execute(db)).resolves.toBeDefined();
        });
    });

    describe('migrations', () => {
        it('runs to completion — proving Kysely never opens a transaction on this dialect', async () => {
            // `SqliteAdapter.supportsTransactionalDdl` is false, so Kysely's
            // `Migrator` never calls `beginTransaction`, which this dialect
            // otherwise throws on. If that assumption ever broke, this test
            // would fail with the branded "no interactive transactions" error
            // instead of a passing migration.
            const provider: MigrationProvider = {
                getMigrations() {
                    return Promise.resolve({
                        '0000_init': {
                            async up(db: Kysely<unknown>) {
                                await db.schema
                                    .createTable('migration_test')
                                    .addColumn('id', 'text', (col) => col.primaryKey())
                                    .addColumn('label', 'text', (col) => col.notNull())
                                    .execute();
                            },
                        },
                    });
                },
            };

            const db = d1({ database: fakeDb }).getInstance();
            await migrateToLatest(db, provider);

            const { rows } =
                await sql`SELECT name FROM sqlite_master WHERE type='table' AND name='migration_test'`.execute(
                    db
                );
            expect(rows).toHaveLength(1);
        });
    });
});
