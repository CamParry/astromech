/**
 * The D1 driver against Cloudflare's own D1 implementation, run locally through
 * wrangler's `getPlatformProxy()` (workerd over SQLite, no account, no network).
 *
 * `tests/database/drivers/d1.test.ts` covers the same driver against a hand-written
 * `D1DatabaseLike` fake, which can only prove the dialect asks for what we think
 * it asks for. This is the one file where the answers come back from D1 itself:
 * its result and `meta` shapes, and whether a migration chain really applies
 * without a transaction. It is also the only test that exercises the wrangler
 * branch of `resolveBinding()`; `tests/integrations/cloudflare/bindings.test.ts` routes
 * every case through `setEnvSource` and says so at the top.
 *
 * Bindings come from `packages/astromech/wrangler.jsonc`, discovered from the
 * working directory the way a real Node host would find its own config.
 */

import type { D1DatabaseLike } from '@/database/drivers/d1-dialect';
import type { Db } from '@/database/types';
import type { Kysely } from 'kysely';
import type { MigrationProvider } from 'kysely/migration';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateToLatest } from '@astromech/schema-engine';
import { makeTestConfig, setupTestConfig } from '@tests/harness';
import { sql } from 'kysely';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { d1 } from '@/database/drivers/d1';
import { assertForeignKeysEnforced } from '@/database/migrations';
import { clearEnvSource, setEnvSource } from '@/env';
import {
    disposeBindings,
    resetBindings,
    resolveBinding,
} from '@/integrations/cloudflare/bindings';
import { userRepository } from '@/users/repository';

/** Test-only schema; deliberately unrelated to the app's `DB` type. */
type TestSchema = {
    round_trip: { id: string; title: string; count: number };
    migrated: { id: string; label: string };
};

// Local D1 state persists under `.wrangler/state` between runs and tests, so
// every table this file owns — Kysely's migration bookkeeping included — is
// dropped before each test, and each test creates the tables it reads. Without
// that the migration case silently no-ops on the second run.
const OWNED_TABLES = [
    'round_trip',
    'migrated',
    'introspected',
    'user_content',
    'users',
    'kysely_migration',
    'kysely_migration_lock',
];

// Booting workerd for the first time is slow enough to blow the default.
const BOOT_TIMEOUT = 60_000;

let db: Kysely<TestSchema>;

beforeAll(async () => {
    // No `setEnvSource`: the lookup must fall through to wrangler, which is the
    // whole point of this file.
    clearEnvSource();
    resetBindings();
    db = d1({ binding: 'DB' }).getInstance() as unknown as Kysely<TestSchema>;
    // The first query boots workerd.
    await sql`SELECT 1`.execute(db);
}, BOOT_TIMEOUT);

beforeEach(async () => {
    for (const table of OWNED_TABLES) {
        await sql.raw(`DROP TABLE IF EXISTS ${table}`).execute(db);
    }
});

/** Create the table the CRUD and meta cases write to. */
async function createRoundTripTable(): Promise<void> {
    await sql`CREATE TABLE round_trip (id TEXT PRIMARY KEY, title TEXT NOT NULL, count INTEGER NOT NULL)`.execute(
        db
    );
}

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
        await createRoundTripTable();

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
        await createRoundTripTable();
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

    // First-run setup's gate, on the driver with no interactive transactions:
    // the conditional insert stands alone there, and D1's `meta.changes` is how
    // its row count comes back.
    it('inserts the first user once, and nothing on a second call', async () => {
        // The app's `users` and `user_content` DDL, less the indexes and
        // foreign keys this case does not need.
        await sql`CREATE TABLE users (
            id TEXT PRIMARY KEY NOT NULL,
            email TEXT NOT NULL,
            name TEXT NOT NULL,
            email_verified INTEGER DEFAULT 0 NOT NULL,
            image TEXT,
            role TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )`.execute(db);
        await sql`CREATE TABLE user_content (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL,
            locale TEXT NOT NULL,
            fields TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            created_by TEXT,
            updated_by TEXT
        )`.execute(db);
        // The app wired to this D1 database the way boot wires it.
        setupTestConfig({ ...makeTestConfig(), db: d1({ binding: 'DB' }) });

        const first = await userRepository.createIfEmpty(
            { email: 'first@test.dev', name: 'First', role: 'admin' },
            { fields: {} }
        );
        const second = await userRepository.createIfEmpty(
            { email: 'second@test.dev', name: 'Second', role: 'admin' },
            { fields: {} }
        );

        expect(first?.email).toBe('first@test.dev');
        expect(second).toBeNull();
        const { rows } = await sql<{ email: string }>`
            SELECT email FROM users
        `.execute(db);
        expect(rows.map((row) => row.email)).toEqual(['first@test.dev']);
    });

    // The migration runner reads `PRAGMA foreign_keys`, and D1 answers only the
    // pragmas it allows.
    it('enforces foreign keys, so the migration check passes', async () => {
        await expect(
            assertForeignKeysEnforced(db as unknown as Db)
        ).resolves.toBeUndefined();
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

// The CLI opens a binding through wrangler's `getPlatformProxy()`, which reaches
// the database on Cloudflare only for a binding the wrangler config marks
// `remote: true`; every other binding is local emulation.
describe('d1 isRemote', () => {
    let siteDir: string;

    beforeAll(() => {
        siteDir = mkdtempSync(join(tmpdir(), 'astromech-d1-remote-'));
        writeFileSync(
            join(siteDir, 'wrangler.jsonc'),
            JSON.stringify({
                name: 'remote-test',
                compatibility_date: '2026-02-14',
                d1_databases: [
                    { binding: 'LOCAL', database_name: 'local', database_id: 'local-id' },
                    {
                        binding: 'PRODUCTION',
                        database_name: 'production',
                        database_id: 'production-id',
                        remote: true,
                    },
                ],
            })
        );
    });

    afterAll(() => {
        rmSync(siteDir, { recursive: true, force: true });
    });

    afterEach(() => {
        clearEnvSource();
    });

    it.each([
        ['reports a binding wrangler emulates locally as local', 'LOCAL', false],
        [
            'reports a binding the wrangler config marks remote as remote',
            'PRODUCTION',
            true,
        ],
        [
            'reports a binding the wrangler config does not declare as remote',
            'MISSING',
            true,
        ],
    ])('%s', async (_label, binding, remote) => {
        vi.spyOn(process, 'cwd').mockReturnValue(siteDir);

        expect(await d1({ binding }).isRemote()).toBe(remote);
    });

    it('reports a binding from a registered Worker environment as remote', async () => {
        vi.spyOn(process, 'cwd').mockReturnValue(siteDir);
        setEnvSource({});

        expect(await d1({ binding: 'LOCAL' }).isRemote()).toBe(true);
    });
});
