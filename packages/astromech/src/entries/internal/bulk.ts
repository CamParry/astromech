/**
 * Bulk dispatch: run a per-id operation across many ids inside a single storage
 * transaction (when the storage supports one), aborting with a
 * `BulkOperationError` that names the failed id and those that already succeeded.
 *
 * Per-id callbacks receive the (tx-bound) storage and a db handle — `undefined`
 * when the storage has no transaction, in which case relationship storage falls
 * back to the registered db.
 */

import type { EntryRepository, RepositoryDb } from '../repository/types';
import { BulkOperationError } from '../errors';
import { getEntryRepository } from '../repository/registry';

export async function runBulk<T>(
    type: string,
    ids: readonly string[],
    perId: (
        repository: EntryRepository,
        db: RepositoryDb | undefined,
        id: string
    ) => Promise<T>
): Promise<T[]> {
    if (ids.length === 0) return [];
    const repository = getEntryRepository(type);
    const run = async (
        txRepository: EntryRepository,
        db: RepositoryDb | undefined
    ): Promise<T[]> => {
        const results: T[] = [];
        const succeeded: string[] = [];
        for (const id of ids) {
            try {
                results.push(await perId(txRepository, db, id));
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
    return repository.transaction(run);
}

export async function runBulkVoid(
    type: string,
    ids: readonly string[],
    perId: (
        repository: EntryRepository,
        db: RepositoryDb | undefined,
        id: string
    ) => Promise<void>
): Promise<void> {
    if (ids.length === 0) return;
    await runBulk(type, ids, perId);
}
