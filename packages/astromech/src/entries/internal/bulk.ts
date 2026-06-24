/**
 * Bulk dispatch: run a per-id operation across many ids inside a single storage
 * transaction (when the storage supports one), aborting with a
 * `BulkOperationError` that names the failed id and those that already succeeded.
 *
 * Per-id callbacks receive the (tx-bound) storage and a db handle — `undefined`
 * when the storage has no transaction, in which case relationship storage falls
 * back to the registered db.
 */

import { getEntryStorage } from '../storage/registry.js';
import { BulkOperationError } from '../errors.js';
import type { EntryStorage, StorageDb } from '../storage/types.js';

export async function runBulk<T>(
    type: string,
    ids: readonly string[],
    perId: (storage: EntryStorage, db: StorageDb | undefined, id: string) => Promise<T>
): Promise<T[]> {
    if (ids.length === 0) return [];
    const storage = getEntryStorage(type);
    const run = async (
        txStorage: EntryStorage,
        db: StorageDb | undefined
    ): Promise<T[]> => {
        const results: T[] = [];
        const succeeded: string[] = [];
        for (const id of ids) {
            try {
                results.push(await perId(txStorage, db, id));
                succeeded.push(id);
            } catch (err) {
                throw new BulkOperationError({
                    failedId: id,
                    reason: err instanceof Error ? err.message : String(err),
                    succeededBefore: succeeded,
                    cause: err,
                });
            }
        }
        return results;
    };
    return storage.transaction ? storage.transaction(run) : run(storage, undefined);
}

export async function runBulkVoid(
    type: string,
    ids: readonly string[],
    perId: (storage: EntryStorage, db: StorageDb | undefined, id: string) => Promise<void>
): Promise<void> {
    if (ids.length === 0) return;
    await runBulk(type, ids, perId);
}
