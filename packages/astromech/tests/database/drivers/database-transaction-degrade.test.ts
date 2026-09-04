/**
 * `transaction()`'s degrade-not-throw contract (`database/transaction.ts`):
 * when the active driver declares `supportsTransactions: false` (Cloudflare D1)
 * it runs `fn` once with no scope open, so `getDb()` inside it is the base
 * connection; when the driver supports interactive transactions it opens one
 * and `getDb()` resolves to that handle.
 */

import type { DB } from '@/database/types';
import type { DatabaseDriver } from '@/types/index';
import type { Dialect, Kysely } from 'kysely';
import { createTestDb } from '@tests/harness';
import { afterEach, describe, expect, it } from 'vitest';
import { setDatabaseDriver } from '@/database/driver-registry';
import { getDb } from '@/database/registry';
import { transaction } from '@/database/transaction';

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

describe('transaction() degradation', () => {
    afterEach(async () => {
        // Restore a transaction-capable driver so this doesn't leak into
        // other tests in the same file.
        await createTestDb();
    });

    it('runs fn once against the base connection when the driver has no interactive transactions', async () => {
        const base = await createTestDb();
        setDatabaseDriver(noTxDriver);

        let seen: unknown;
        await transaction(async () => {
            seen = getDb();
        });
        expect(seen).toBe(base);
    });

    it('opens a transaction and scopes getDb() to it when the driver supports transactions (default)', async () => {
        const base = await createTestDb();

        let seen: unknown;
        await transaction(async () => {
            seen = getDb();
        });
        expect(seen).toBeDefined();
        expect(seen).not.toBe(base);
    });
});
