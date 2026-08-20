/**
 * Entry mutation dispatch: run a per-id operation over one or many ids, a single
 * id being a batch of one. `runBulk` is the inner primitive — it loops per-id
 * inside a single storage transaction (when the storage supports one), aborting
 * with a `BulkOperationError` that names the failed id and those that already
 * succeeded. `runOnIds` routes an array through it and a single id through a
 * transaction of its own.
 *
 * Per-id callbacks receive the (tx-bound) storage and a db handle — `undefined`
 * when the storage has no transaction, in which case relationship storage falls
 * back to the registered db.
 */

import type { EntryRepository, RepositoryDb } from '../repository/types';
import { BulkOperationError } from '../errors';
import { getEntryRepository } from '../repository/registry';

async function runBulk<T>(
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

/**
 * Run a per-id operation over one or many ids. An array returns an array of
 * results and routes through `runBulk`; a single id returns a single result and
 * opens a transaction of its own, matching the overloaded public signature.
 */
export async function runOnIds<T>(
    type: string,
    id: string | readonly string[],
    perId: (
        repository: EntryRepository,
        db: RepositoryDb | undefined,
        id: string
    ) => Promise<T>
): Promise<T | T[]> {
    if (Array.isArray(id)) return runBulk(type, id, perId);
    // A batch of one: open a transaction like the batch does, so a single write
    // is atomic too, but surface a failure as the plain error — there are no
    // siblings to name, so no BulkOperationError wrapping.
    const repository = getEntryRepository(type);
    return repository.transaction((repo, db) => perId(repo, db, id as string));
}

/** Void form of `runOnIds`, for operations that return nothing. */
export async function runOnIdsVoid(
    type: string,
    id: string | readonly string[],
    perId: (
        repository: EntryRepository,
        db: RepositoryDb | undefined,
        id: string
    ) => Promise<void>
): Promise<void> {
    await runOnIds(type, id, perId);
}
