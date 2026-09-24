import type { AppContext, Entry } from '@/types/index';
import { transaction } from '@/database/transaction';
import { CapabilityError } from '@/errors/capability';
import { BulkOperationError } from '../errors';
import { getEntryRepository } from '../repository/registry';
import { getEntryResources, toEntry } from './read-entry';

/**
 * Restore a batch of trashed entries, atomically, returning each one's
 * default-locale row. Restoring is resource-level: every locale comes back.
 * `restore` declares `requires: 'trash'`, so the type keeps a bin. Fires no
 * hooks — there is no restore hook event.
 *
 * Batch-only: `methods/restore.ts` reaches it through `fromBatch`.
 */
export async function restoreEntryBatch(
    params: { type: string; ids: readonly string[] },
    ctx: AppContext
): Promise<Entry[]> {
    const { type, ids } = params;
    const repository = getEntryRepository(type);
    const { trash } = repository;
    if (!trash) throw new CapabilityError('entry', type, 'trash');
    const entries = await getEntryResources(ctx.config, repository, type, ids);
    const user = ctx.user;

    return transaction(async () => {
        const rows: Entry[] = [];
        const succeeded: string[] = [];
        for (const entry of entries) {
            try {
                rows.push(toEntry(await trash.restore(entry.id, user?.id ?? null)));
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
