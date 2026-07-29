/**
 * Entry storage's degrade-not-throw contract: when the active driver declares
 * `supportsTransactions: false` (Cloudflare D1), both storage backends drop
 * their `transaction` method rather than exposing one that would fail.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { Dialect, Kysely } from 'kysely';
import { createTestDb } from '@tests/harness.js';
import { setDatabaseDriver } from '@/database/driver-registry.js';
import { createBuiltInEntryStorage } from '@/entries/storage/built-in.js';
import { tableStorage } from '@/entries/storage/table.js';
import { defineTable } from '@/database/define-table.js';
import type { DatabaseDriver } from '@/types/index.js';
import type { DB } from '@/database/types.js';

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

    it('drops transaction when the active driver has no interactive transactions', async () => {
        await createTestDb();
        setDatabaseDriver(noTxDriver);

        expect(createBuiltInEntryStorage().transaction).toBeUndefined();
        expect(tableStorage(scratchTable).transaction).toBeUndefined();
    });

    it('keeps transaction when the active driver supports transactions (default)', async () => {
        await createTestDb();

        expect(createBuiltInEntryStorage().transaction).toBeDefined();
        expect(tableStorage(scratchTable).transaction).toBeDefined();
    });
});
