import type { EntryResource } from '../repository/types';
import type { AppContext } from '@/types/index';
import { entryRepository } from '../repository/entries-table';
import { getEntryResources } from './read-entry';
import { writeBatch } from './write-batch';

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
): Promise<EntryResource[]> {
    const { type, ids } = params;
    const entries = await getEntryResources(type, ids);
    const user = ctx.user;

    return writeBatch(entries, (entry) =>
        entryRepository.trash.restore(entry.id, user?.id ?? null)
    );
}
