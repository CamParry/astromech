import type { AppContext, Entry } from '@/types/index';
import { transaction } from '@/database/transaction';
import { BulkOperationError, CapabilityError } from '../errors';
import { getEntryRepository } from '../repository/registry';
import { assertCapability } from './entry-type';
import { asEntry, getEntryResources } from './records';

/**
 * Restore a batch of trashed entries, atomically, returning each one's
 * default-locale row. Restoring is resource-level: every locale comes back.
 * Throws if the type does not support trash. Fires no hooks — there is no
 * restore hook event.
 *
 * Batch-only: `methods/restore.ts` reaches it through `fromBatch`.
 */
export async function restoreEntryBatch(
    params: { type: string; ids: readonly string[] },
    ctx: AppContext
): Promise<Entry[]> {
    const { type, ids } = params;
    const repository = getEntryRepository(type);
    assertCapability(type, 'trash');
    const { trash } = repository;
    if (!trash) throw new CapabilityError(type, 'trash');
    const entries = await getEntryResources(repository, type, ids);
    const user = ctx.user;

    return transaction(async () => {
        const rows: Entry[] = [];
        const succeeded: string[] = [];
        for (const entry of entries) {
            try {
                rows.push(asEntry(await trash.restore(entry.id, user?.id ?? null)));
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
