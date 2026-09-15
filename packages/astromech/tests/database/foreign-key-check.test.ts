/**
 * The migration runner refuses a database that does not enforce foreign keys,
 * because deleting a user relies on `ON DELETE set null` and `ON DELETE cascade`
 * to clear and remove that user's rows.
 *
 * The refused database is a `:memory:` libSQL client with the pragma turned
 * off. It has a single connection, so the setting holds for every later query.
 * The D1 case is in `tests/integrations/cloudflare/d1-local-emulation.test.ts`.
 */

import type { DB } from '@/database/types';
import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { createTestDb } from '@tests/harness';
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { assertForeignKeysEnforced, runMigrations } from '@/database/migrations';
import { AstromechError } from '@/errors/astromech-error';

describe('the foreign key check', () => {
    it('passes on the test database, where libSQL enforces foreign keys by default', async () => {
        const db = await createTestDb();

        await expect(assertForeignKeysEnforced(db)).resolves.toBeUndefined();
    });

    it('stops runMigrations when PRAGMA foreign_keys reads 0', async () => {
        const client = createClient({ url: ':memory:' });
        const db = new Kysely<DB>({
            // `@libsql/kysely-libsql` pins an older `@libsql/core` Client type;
            // the runtime client is compatible (see the libsql driver).
            dialect: new LibsqlDialect({ client: client as never }),
            plugins: [new CamelCasePlugin()],
        });
        try {
            await sql`PRAGMA foreign_keys = OFF`.execute(db);
            const messages: string[] = [];
            const logger = {
                info: (message: string) => messages.push(message),
                error: (message: string) => messages.push(message),
            };

            const run = runMigrations(db, logger, [], './migrations');

            await expect(run).rejects.toBeInstanceOf(AstromechError);
            await expect(run).rejects.toThrow(
                'The database does not enforce foreign keys (PRAGMA foreign_keys is 0).'
            );
            // It threw before loading or applying any migration.
            expect(messages).toEqual([]);
        } finally {
            await db.destroy();
        }
    });
});
