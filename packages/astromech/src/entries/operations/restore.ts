import type { Entry } from '@/types/index';
import { transaction } from '@/database/transaction';
import { BulkOperationError } from '../errors';
import { asEntry, loadEntries } from '../internal/records';
import { requireTrash } from '../internal/type-config';
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
    const trash = requireTrash(repository, type);
    const entries = await loadEntries(repository, type, ids);

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
