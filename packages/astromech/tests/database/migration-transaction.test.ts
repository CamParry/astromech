/**
 * The libsql driver runs a migration chain in one transaction, so a generated
 * rebuild of a table that rows point at keeps those rows, and a migration that
 * leaves a row pointing at nothing rolls the whole run back.
 */

import type { DB } from '@/database/types';
import type { Snapshot, SnapshotTable } from '@astromech/schema-engine';
import type { Kysely } from 'kysely';
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dumpSchema } from '@astromech/schema-engine';
import { generateMigrations } from '@astromech/schema-engine/generate';
import { createTestDb } from '@tests/harness';
import { migrateTestDb } from '@tests/test-db';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { libsql } from '@/database/drivers/libsql';
import { runMigrations } from '@/database/migrations';

let siteDir: string;
let migrationsDir: string;
let db: Kysely<DB>;

beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), 'astromech-migration-transaction-'));
    migrationsDir = join(siteDir, 'migrations');
    // The generated files import `kysely`, which a real site has installed.
    await symlink(
        fileURLToPath(new URL('../../node_modules', import.meta.url)),
        join(siteDir, 'node_modules'),
        'dir'
    );
    db = libsql({ url: `file:${join(siteDir, 'database.db')}` }).getInstance();
});

afterEach(async () => {
    await db.destroy();
    await rm(siteDir, { recursive: true, force: true });
});

const logger = {
    info: () => undefined,
    error: (message: string) => {
        throw new Error(message);
    },
};
let runs = 0;

/** Generate the migration from the last snapshot to `snapshot`. */
async function generate(snapshot: Snapshot, name: string): Promise<void> {
    const result = await generateMigrations({
        dir: migrationsDir,
        snapshot,
        dialect: 'sqlite',
        name,
    });
    expect(result.status).toBe('generated');
}

/** Run the chain as `db:init` does. jiti caches a module by path, so each run
 *  loads a copy of the chain made after the last `generate`. */
async function runChain(): Promise<void> {
    runs += 1;
    const copy = join(siteDir, `migrations-${runs}`);
    await cp(migrationsDir, copy, { recursive: true });
    await runMigrations(db, logger, [], copy);
}

function snapshot(...tables: SnapshotTable[]): Snapshot {
    return {
        version: 1,
        dialect: 'sqlite',
        tables: Object.fromEntries(tables.map((t) => [t.name, t])),
    };
}

/** A table of text columns, the first its primary key. */
function table(
    name: string,
    columns: string[],
    references?: { column: string; table: string }
): SnapshotTable {
    return {
        name,
        columns: columns.map((column, i) => ({
            name: column,
            type: 'text',
            notNull: i === 0,
            primaryKey: i === 0,
        })),
        fks:
            references === undefined
                ? []
                : [
                      {
                          column: references.column,
                          targetTable: references.table,
                          targetColumn: 'id',
                          onDelete: 'no action',
                      },
                  ],
        indexes: [],
    };
}

async function rows(query: string): Promise<unknown[]> {
    return (await sql.raw(query).execute(db)).rows;
}

describe('a libsql migration run', () => {
    it('keeps the rows that point at a table it rebuilds', async () => {
        const child = table('beta', ['id', 'parent'], {
            column: 'parent',
            table: 'alpha',
        });
        await generate(snapshot(table('alpha', ['id', 'note']), child), 'init');
        await runChain();
        await sql`INSERT INTO alpha (id, note) VALUES ('a', 'x')`.execute(db);
        await sql`INSERT INTO beta (id, parent) VALUES ('b', 'a')`.execute(db);

        await generate(snapshot(table('alpha', ['id']), child), 'drop-note');
        await runChain();

        expect(await rows("SELECT name FROM pragma_table_info('alpha')")).toEqual([
            { name: 'id' },
        ]);
        expect(await rows('SELECT id, parent FROM beta')).toEqual([
            { id: 'b', parent: 'a' },
        ]);
    });

    it('rolls back every pending migration when one leaves a row pointing at nothing', async () => {
        const alpha = table('alpha', ['id']);
        const withNote = table('alpha', ['id', 'note']);
        await generate(snapshot(alpha, table('beta', ['id', 'parent'])), 'init');
        await runChain();
        await sql`INSERT INTO beta (id, parent) VALUES ('b', 'missing')`.execute(db);
        await generate(snapshot(withNote, table('beta', ['id', 'parent'])), 'add-note');
        const child = table('beta', ['id', 'parent'], {
            column: 'parent',
            table: 'alpha',
        });
        await generate(snapshot(withNote, child), 'reference-alpha');

        await expect(runChain()).rejects.toThrow(
            'foreign key check failed: [{"table":"beta"'
        );

        expect(await rows("SELECT name FROM pragma_table_info('alpha')")).toEqual([
            { name: 'id' },
        ]);
        expect(await rows("SELECT * FROM pragma_foreign_key_list('beta')")).toEqual([]);
        expect(
            await rows("SELECT name FROM sqlite_master WHERE name GLOB '__new_*'")
        ).toEqual([]);
        expect(await rows('SELECT id, parent FROM beta')).toEqual([
            { id: 'b', parent: 'missing' },
        ]);
        expect(await rows('SELECT name FROM kysely_migration')).toEqual([
            { name: '0000_init' },
        ]);
    });

    it('applies the first-party chain in one transaction to the schema the test template has', async () => {
        await migrateTestDb(db);

        expect(await dumpSchema(db)).toEqual(await dumpSchema(await createTestDb()));
    });
});
