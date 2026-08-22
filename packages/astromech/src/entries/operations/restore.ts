import type { Entry } from '@/types/index';
import { transaction } from '@/database/transaction';
import { BulkOperationError, CapabilityError } from '../errors';
import { assertCapability } from '../internal/entry-type';
import { asEntry, getEntriesOfType } from '../internal/records';
import { getEntryRepository } from '../repository/registry';

/**
 * Restore one or many trashed entries, atomically per batch, returning the
 * restored rows. Throws if the type does not support trash. Fires no hooks —
 * there is no restore hook event.
 */
export async function restoreEntries(params: {
    type: string;
    ids: readonly string[];
}): Promise<Entry[]> {
    const { type, ids } = params;
    const repository = getEntryRepository(type);
    assertCapability(type, 'trash');
    const { trash } = repository;
    if (!trash) throw new CapabilityError(type, 'trash');
    const entries = await getEntriesOfType(repository, type, ids);

    return transaction(async () => {
        const rows: Entry[] = [];
        const succeeded: string[] = [];
        for (const entry of entries) {
            try {
                rows.push(asEntry(await trash.restore(entry.id)));
                succeeded.push(entry.id);
            } catch (err) {
                throw new BulkOperationError({
                    failedId: entry.id,
                    reason: err instanceof Error ? err.message : String(err),
                    succeededBefore: succeeded,
                    cause: err,
                });
            }
        }
        return rows;
    });
}
