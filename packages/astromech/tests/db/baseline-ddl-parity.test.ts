/**
 * Migration-chain ↔ table DDL parity — the drift gate.
 *
 * Builds two SQLite databases: one via `apps/demo/migrations`' full
 * `migrationProvider` chain (`migrateToLatest`, run by `createTestDb`), one by
 * executing `emitTableStatements()` for the same `defineTable` tables
 * (`CORE_TABLES`) directly. Compares them through the engine's `dumpSchema`
 * oracle — one normalized `sqlite_master` dump everywhere — so the committed
 * migration chain and the tables it was generated from never silently
 * drift apart.
 */
import type { SchemaRow } from '@astromech/schema-engine';
import { dumpSchema } from '@astromech/schema-engine';
import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { createTestDb } from '@tests/harness';
import { Kysely, sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { emitTableStatements } from '@/database/table-snapshot';
import { CORE_TABLES } from '@/database/tables';

const TABLE_NAMES = CORE_TABLES.map((table) => table.name);

async function buildEmitterDb(): Promise<Kysely<unknown>> {
    const client = createClient({ url: ':memory:' });
    const db = new Kysely<unknown>({
        dialect: new LibsqlDialect({ client: client as never }),
    });
    for (const table of CORE_TABLES) {
        for (const statement of emitTableStatements(table, 'sqlite')) {
            await sql.raw(statement).execute(db);
        }
    }
    return db;
}

function ofType(rows: SchemaRow[], type: 'table' | 'index'): SchemaRow[] {
    return rows.filter((row) => row.type === type);
}

describe('migration chain ↔ table DDL parity', () => {
    it('produces identical CREATE TABLE statements for every `defineTable`-backed table', async () => {
        const migrated = await dumpSchema(await createTestDb(), { tables: TABLE_NAMES });
        const emitted = await dumpSchema(await buildEmitterDb(), { tables: TABLE_NAMES });

        expect(ofType(migrated, 'table')).toEqual(ofType(emitted, 'table'));
    });

    it('produces identical index sets for every `defineTable`-backed table', async () => {
        const migrated = await dumpSchema(await createTestDb(), { tables: TABLE_NAMES });
        const emitted = await dumpSchema(await buildEmitterDb(), { tables: TABLE_NAMES });

        expect(ofType(migrated, 'index')).toEqual(ofType(emitted, 'index'));
    });
});
