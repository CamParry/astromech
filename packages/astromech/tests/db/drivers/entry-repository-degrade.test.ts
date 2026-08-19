/**
 * Entry storage's degrade-not-throw contract: `transaction` is always present on
 * both storage backends. When the active driver declares
 * `supportsTransactions: false` (Cloudflare D1) it runs `fn` sequentially with a
 * `db` of `undefined` and no atomicity; when the driver supports interactive
 * transactions it runs `fn` atomically with a real tx db handle.
 */

import type { DB } from '@/database/types';
import type { DatabaseDriver } from '@/types/index';
import type { Dialect, Kysely } from 'kysely';
import { createTestDb } from '@tests/harness';
import { afterEach, describe, expect, it } from 'vitest';
import { defineTable } from '@/database/define-table';
import { setDatabaseDriver } from '@/database/driver-registry';
import { createBuiltInEntryRepository } from '@/entries/repository/built-in';
import { tableRepository } from '@/entries/repository/table';

const scratchTable = defineTable('degrade_scratch', ({ col }) => ({
    id: col.id(),
}));

const noTxDriver: DatabaseDriver = {
    type: 'no-tx-fake',
    getInstance(): Kysely<DB> {
        throw new Error('unused in this test — only supportsTransactions is read');
    },
    createDialect(): Dialect {
        throw new Error('unused in this test — only supportsTransactions is read');
    },
    supportsTransactions: false,
};

describe('entry storage transaction degradation', () => {
    afterEach(async () => {
        // Restore a transaction-capable driver so this doesn't leak into
        // other tests in the same file.
        await createTestDb();
    });

    it('runs fn sequentially with no tx handle when the driver has no interactive transactions', async () => {
        await createTestDb();
        setDatabaseDriver(noTxDriver);

        const builtIn = createBuiltInEntryRepository();
        expect(builtIn.transaction).toBeDefined();
        let builtInDb: unknown = 'unset';
        await builtIn.transaction(async (_repository, db) => {
            builtInDb = db;
        });
        expect(builtInDb).toBeUndefined();

        const table = tableRepository(scratchTable);
        expect(table.transaction).toBeDefined();
        let tableDb: unknown = 'unset';
        await table.transaction(async (_repository, db) => {
            tableDb = db;
        });
        expect(tableDb).toBeUndefined();
    });

    it('runs fn atomically with a tx db handle when the driver supports transactions (default)', async () => {
        await createTestDb();

        let builtInDb: unknown;
        await createBuiltInEntryRepository().transaction(async (_repository, db) => {
            builtInDb = db;
        });
        expect(builtInDb).toBeDefined();

        let tableDb: unknown;
        await tableRepository(scratchTable).transaction(async (_repository, db) => {
            tableDb = db;
        });
        expect(tableDb).toBeDefined();
    });
});
