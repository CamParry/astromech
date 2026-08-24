/**
 * Transaction scope — an `AsyncLocalStorage` boundary holding the open Kysely
 * transaction handle, the same registry-backed store `request-context` uses.
 * `getDb()` reads it first, so every repository joins without being told.
 */

import type { Db } from '@/database/types';
import { AsyncLocalStorage } from 'node:async_hooks';
import { supportsTransactions } from '@/database/capabilities';
import { getDb } from '@/database/registry';
import { createRegistry } from '@/registry';

const transactionScope = createRegistry<AsyncLocalStorage<Db>>('transactionScope', {
    required: false,
});

/**
 * The store lives in a registry: the package has multiple bundle entry points,
 * so a second copy of this module in another chunk would otherwise be a second,
 * EMPTY store. Constructed here on first use rather than in the registry.
 */
function store(): AsyncLocalStorage<Db> {
    const existing = transactionScope.get();
    if (existing) return existing;
    const created = new AsyncLocalStorage<Db>();
    transactionScope.set(created);
    return created;
}

/** The open transaction handle, or undefined outside a `transaction()` scope. */
export function getTransactionScope(): Db | undefined {
    return store().getStore();
}

/**
 * Run `fn` as one transaction; `getDb()` resolves to the open handle for `fn`
 * and everything it awaits. Nesting joins: a call inside an already-open scope
 * just runs `fn` there, on the same handle — no savepoint (`DECISIONS.md`,
 * superseding 0055's throw). Runs `fn` once with no transaction when the driver
 * has no interactive transactions (D1), the degrade 0028 and 0076 committed to.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (getTransactionScope() !== undefined) return fn();
    if (!supportsTransactions()) return fn();
    return getDb()
        .transaction()
        .execute((trx) => store().run(trx, fn));
}
