/**
 * Tests for the migration runner (`src/apply.ts`).
 *
 * Applies a two-migration provider to a real libsql db (plain DDL, so
 * `:memory:` is fine) and checks that a failing migration surfaces its name.
 */

import { describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import { Kysely, sql, type MigrationProvider } from 'kysely';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { migrateToLatest } from '../src/apply.js';
import { dumpSchema } from '../src/oracle.js';

function makeDb(): Kysely<unknown> {
    const client = createClient({ url: ':memory:' });
    return new Kysely<unknown>({
        dialect: new LibsqlDialect({ client: client as never }),
    });
}

const twoMigrations: MigrationProvider = {
    async getMigrations() {
        return {
            '0000_init': {
                async up(db: Kysely<unknown>) {
                    await sql`CREATE TABLE \`widgets\` (\`id\` text PRIMARY KEY NOT NULL)`.execute(
                        db
                    );
                },
            },
            '0001_add-note': {
                async up(db: Kysely<unknown>) {
                    await sql`ALTER TABLE \`widgets\` ADD COLUMN \`note\` text`.execute(
                        db
                    );
                },
            },
        };
    },
};

describe('migrateToLatest', () => {
    it('applies every migration in the provider, in order', async () => {
        const db = makeDb();
        await migrateToLatest(db, twoMigrations);

        const rows = await dumpSchema(db, { tables: ['widgets'] });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.sql).toContain('`note` text');
    });

    it('is idempotent — a second run applies nothing new', async () => {
        const db = makeDb();
        await migrateToLatest(db, twoMigrations);
        await expect(migrateToLatest(db, twoMigrations)).resolves.toBeUndefined();
    });

    it('surfaces the failing migration by name', async () => {
        const db = makeDb();
        const broken: MigrationProvider = {
            async getMigrations() {
                return {
                    '0000_broken': {
                        async up(inner: Kysely<unknown>) {
                            await sql`CREATE TABLE \`widgets\` (nonsense`.execute(inner);
                        },
                    },
                };
            },
        };

        await expect(migrateToLatest(db, broken)).rejects.toThrow(/0000_broken/);
    });
});
