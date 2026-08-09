/**
 * The D1 driver against Cloudflare's own D1 implementation, run locally through
 * wrangler's `getPlatformProxy()` (workerd over SQLite, no account, no network).
 *
 * `tests/db/drivers/d1.test.ts` covers the same driver against a hand-written
 * `D1DatabaseLike` fake, which can only prove the dialect asks for what we think
 * it asks for. This is the one file where the answers come back from D1 itself:
 * its result and `meta` shapes, and whether a migration chain really applies
 * without a transaction. It is also the only test that exercises the wrangler
 * branch of `resolveBinding()` — `tests/cloudflare/bindings.test.ts` routes
 * every case through `setBindingEnv` and says so at the top.
 *
 * Bindings come from `packages/astromech/wrangler.jsonc`, discovered from the
 * working directory the way a real Node host would find its own config.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type Kysely, type MigrationProvider } from 'kysely';
import { migrateToLatest } from '@astromech/schema-engine';
import { d1 } from '@/database/drivers/d1';
import { disposeBindings, resetBindingEnv, resolveBinding } from '@/cloudflare/bindings';
import type { D1DatabaseLike } from '@/database/drivers/d1-dialect';

/** Test-only schema; deliberately unrelated to the app's `DB` type. */
type TestSchema = {
    round_trip: { id: string; title: string; count: number };
    migrated: { id: string; label: string };
};

// Local D1 state persists under `.wrangler/state` between runs, so every table
// this file owns — Kysely's migration bookkeeping included — is dropped up
// front. Without that the migration case silently no-ops on the second run.
const OWNED_TABLES = [
    'round_trip',
    'migrated',
    'introspected',
    'kysely_migration',
    'kysely_migration_lock',
];

// Booting workerd for the first time is slow enough to blow the default.
const BOOT_TIMEOUT = 60_000;

let db: Kysely<TestSchema>;

beforeAll(async () => {
    // No `setBindingEnv`: detection must fall through to wrangler, which is the
    // whole point of this file.
    resetBindingEnv();
    db = d1({ binding: 'DB' }).getInstance() as unknown as Kysely<TestSchema>;
    for (const table of OWNED_TABLES) {
        await sql.raw(`DROP TABLE IF EXISTS ${table}`).execute(db);
    }
}, BOOT_TIMEOUT);

afterAll(async () => {
    await db.destroy();
    // The workerd process outlives the test run if the proxy is never disposed.
    await disposeBindings();
});

describe('d1() against local emulation', () => {
    it('resolves the binding through wrangler, with no env supplied', async () => {
        const binding = await resolveBinding<D1DatabaseLike & { exec?: unknown }>('DB');
        expect(typeof binding.prepare).toBe('function');
        expect(typeof binding.batch).toBe('function');
        // `exec` is D1's, not ours — the structural `D1DatabaseLike` has no such
        // member, so finding it proves this is a real D1Database and not a
        // fixture that happens to satisfy our type.
        expect(typeof binding.exec).toBe('function');
    });

    it('performs a full CRUD round-trip through Kysely', async () => {
        await sql`CREATE TABLE round_trip (id TEXT PRIMARY KEY, title TEXT NOT NULL, count INTEGER NOT NULL)`.execute(
            db
        );

        await db
            .insertInto('round_trip')
            .values({ id: 'a', title: 'alpha', count: 1 })
            .execute();
        const created = await db
            .selectFrom('round_trip')
            .selectAll()
            .where('id', '=', 'a')
            .executeTakeFirst();
        expect(created).toEqual({ id: 'a', title: 'alpha', count: 1 });

        await db
            .updateTable('round_trip')
            .set({ count: 2 })
            .where('id', '=', 'a')
            .execute();
        const updated = await db
            .selectFrom('round_trip')
            .selectAll()
            .where('id', '=', 'a')
            .executeTakeFirst();
        expect(updated?.count).toBe(2);

        await db.deleteFrom('round_trip').where('id', '=', 'a').execute();
        const deleted = await db
            .selectFrom('round_trip')
            .selectAll()
            .where('id', '=', 'a')
            .executeTakeFirst();
        expect(deleted).toBeUndefined();
    });

    it('maps insertId and affected-row counts from D1 meta', async () => {
        await db
            .insertInto('round_trip')
            .values({ id: 'm1', title: 'meta', count: 1 })
            .execute();

        const inserted = await db
            .insertInto('round_trip')
            .values({ id: 'm2', title: 'meta', count: 1 })
            .executeTakeFirst();
        expect(typeof inserted?.insertId).toBe('bigint');

        const updateResult = await db
            .updateTable('round_trip')
            .set({ count: 9 })
            .where('title', '=', 'meta')
            .executeTakeFirst();
        expect(updateResult?.numUpdatedRows).toBe(2n);

        const deleteResult = await db
            .deleteFrom('round_trip')
            .where('title', '=', 'meta')
            .executeTakeFirst();
        expect(deleteResult?.numDeletedRows).toBe(2n);
    });

    it("introspects columns, which Kysely's own SQLite introspector cannot do here", async () => {
        await sql`CREATE TABLE introspected (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            note TEXT,
            rank INTEGER DEFAULT 0
        )`.execute(db);

        const tables = await db.introspection.getTables();
        const table = tables.find((candidate) => candidate.name === 'introspected');
        expect(table).toBeDefined();
        expect(table?.isView).toBe(false);
        expect(table?.columns.map((column) => column.name)).toEqual([
            'id',
            'label',
            'note',
            'rank',
        ]);

        const byName = new Map(table?.columns.map((column) => [column.name, column]));
        expect(byName.get('id')?.isAutoIncrementing).toBe(true);
        expect(byName.get('label')?.isNullable).toBe(false);
        expect(byName.get('note')?.isNullable).toBe(true);
        expect(byName.get('rank')?.hasDefaultValue).toBe(true);
        expect(byName.get('label')?.isAutoIncrementing).toBe(false);

        // D1 keeps its own bookkeeping in the same SQLite file; it is not a
        // table the app owns and must not surface as one.
        expect(tables.map((candidate) => candidate.name)).not.toContain('_cf_METADATA');
    });

    it('applies a migration chain, which D1 can only do without a transaction', async () => {
        const provider: MigrationProvider = {
            getMigrations() {
                return Promise.resolve({
                    '0000_init': {
                        async up(migrationDb: Kysely<unknown>) {
                            await migrationDb.schema
                                .createTable('migrated')
                                .addColumn('id', 'text', (col) => col.primaryKey())
                                .addColumn('label', 'text', (col) => col.notNull())
                                .execute();
                        },
                    },
                });
            },
        };

        await migrateToLatest(db as unknown as Kysely<unknown>, provider);

        await db.insertInto('migrated').values({ id: 'x', label: 'applied' }).execute();
        const row = await db
            .selectFrom('migrated')
            .selectAll()
            .where('id', '=', 'x')
            .executeTakeFirst();
        expect(row?.label).toBe('applied');
    });
});
