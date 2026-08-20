/**
 * Entry mutation dispatch: run a per-id operation over one or many ids, a single
 * id being a batch of one. `runBulk` is the inner primitive — it loops per-id
 * inside one `transaction()` scope, aborting with a `BulkOperationError` that
 * names the failed id and those that already succeeded. `runOnIds` routes an
 * array through it and a single id through a transaction of its own.
 *
 * Per-id callbacks still receive a db handle for shape compatibility with their
 * callers; it is always `undefined` now — `getDb()` resolves the open
 * `transaction()` scope on its own, so nothing needs it passed by hand.
 */

import type { EntryRepository, RepositoryDb } from '../repository/types';
import { transaction } from '@/database/transaction';
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
    return transaction(async (): Promise<T[]> => {
        const results: T[] = [];
        const succeeded: string[] = [];
        for (const id of ids) {
            try {
                results.push(await perId(repository, undefined, id));
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
    });
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
    return transaction(() => perId(repository, undefined, id as string));
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
