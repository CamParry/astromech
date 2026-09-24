import { transaction } from '@/database/transaction';
import { BulkOperationError } from '../errors';

/**
 * Write each item of a batch in order, inside one transaction. A failure rolls
 * the whole batch back and throws a `BulkOperationError` naming the failed id
 * and the ids written before it. Shared by the entry batch writes.
 */
export async function writeBatch<T extends { id: string }, R>(
    items: readonly T[],
    write: (item: T) => Promise<R>
): Promise<R[]> {
    return transaction(async () => {
        const results: R[] = [];
        const succeeded: string[] = [];
        for (const item of items) {
            try {
                results.push(await write(item));
                succeeded.push(item.id);
            } catch (err) {
                throw new BulkOperationError({
                    failedId: item.id,
                    reason: err instanceof Error ? err.message : String(err),
                    succeededBefore: succeeded,
                    cause: err,
                });
            }
        }
        return results;
    });
}
