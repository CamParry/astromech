/**
 * Baseline ↔ descriptor DDL parity — the pre-step-4 drift gate.
 *
 * Builds two SQLite databases: one via the app's hand-authored baseline
 * migration (`apps/demo/drizzle/baseline.ts`), one by executing
 * `emitTableStatements()` for the same 9 `defineTable` descriptors directly.
 * Asserts their `sqlite_master` rows (CREATE TABLE / CREATE INDEX SQL,
 * whitespace-normalized) are identical for those 9 tables, so the two never
 * silently drift apart.
 */

import { describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import { Kysely, sql } from 'kysely';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { createTestDb } from '@tests/harness.js';
import { emitTableStatements } from '@/database/ddl.js';
import { roles } from '@/users/schema.js';
import { entries, entryVersions, entryPreviewTokens } from '@/entries/schema.js';
import { media } from '@/media/schema.js';
import { settings } from '@/settings/schema.js';
import { notifications } from '@/notifications/schema.js';
import { relationships, cron } from '@/database/schema.js';

const DESCRIPTOR_TABLES = [
    roles,
    entries,
    entryVersions,
    entryPreviewTokens,
    media,
    settings,
    notifications,
    relationships,
    cron,
];
const TABLE_NAMES = DESCRIPTOR_TABLES.map((table) => table.name);

type MasterRow = { name: string; tblName: string; sql: string | null };

function normalize(value: string | null): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
}

async function buildEmitterDb(): Promise<Kysely<unknown>> {
    const client = createClient({ url: ':memory:' });
    const db = new Kysely<unknown>({
        dialect: new LibsqlDialect({ client: client as never }),
    });
    for (const table of DESCRIPTOR_TABLES) {
        for (const statement of emitTableStatements(table, 'sqlite')) {
            await sql.raw(statement).execute(db);
        }
    }
    return db;
}

async function masterRows<DB>(
    db: Kysely<DB>,
    type: 'table' | 'index'
): Promise<MasterRow[]> {
    const names = TABLE_NAMES.map((name) => `'${name}'`).join(',');
    const { rows } = await sql
        .raw<MasterRow>(
            `SELECT name, tbl_name AS tblName, sql FROM sqlite_master ` +
                `WHERE type='${type}' AND tbl_name IN (${names}) ORDER BY tbl_name, name`
        )
        .execute(db);
    return rows;
}

describe('baseline ↔ descriptor DDL parity', () => {
    it('produces identical CREATE TABLE statements for the 9 descriptor-backed tables', async () => {
        const baselineDb = await createTestDb();
        const emitterDb = await buildEmitterDb();

        const baselineTables = await masterRows(baselineDb, 'table');
        const emitterTables = await masterRows(emitterDb, 'table');

        expect(
            baselineTables.map((r) => ({ name: r.name, sql: normalize(r.sql) }))
        ).toEqual(emitterTables.map((r) => ({ name: r.name, sql: normalize(r.sql) })));
    });

    it('produces identical index sets for the 9 descriptor-backed tables', async () => {
        const baselineDb = await createTestDb();
        const emitterDb = await buildEmitterDb();

        const baselineIndexes = await masterRows(baselineDb, 'index');
        const emitterIndexes = await masterRows(emitterDb, 'index');

        const shape = (rows: MasterRow[]) =>
            rows.map((r) => ({
                name: r.name,
                tblName: r.tblName,
                sql: normalize(r.sql),
            }));

        expect(shape(baselineIndexes)).toEqual(shape(emitterIndexes));
    });
});
