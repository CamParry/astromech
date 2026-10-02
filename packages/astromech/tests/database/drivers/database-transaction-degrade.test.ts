/**
 * `transaction()`'s degrade-not-throw contract (`database/transaction.ts`):
 * when the active driver declares `supportsTransactions: false` (Cloudflare D1)
 * it runs `fn` once with no scope open, so `getDb()` inside it is the base
 * connection; when the driver supports interactive transactions it opens one
 * and `getDb()` resolves to that handle.
 */

import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { describe, expect, it } from 'vitest';
import { getDb } from '@/database/registry';
import { transaction } from '@/database/transaction';

describe('transaction() degradation', () => {
    it('runs fn once against the base connection when the driver has no interactive transactions', async () => {
        const base = await createTestDb();
        setupTestConfig({
            ...makeTestConfig(),
            db: { type: 'no-tx', getInstance: () => base, supportsTransactions: false },
        });

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
