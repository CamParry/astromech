import type { EntryResource } from '../repository/types';
import type { AppContext } from '@/types/index';
import { relationshipRepository } from '@/content/repository/relationships';
import { parseOutput } from '@/services/parse-method-output';
import { entryRepository } from '../repository/entries-table';
import { entrySchema } from '../schema';
import { getEntryResources } from './read-entry';
import { writeBatch } from './write-batch';

/**
 * Permanently delete a batch of entries, atomically, firing the entry delete
 * hooks around the write. Deleting is resource-level: every locale of an entry
 * goes with it. Throws if an id is missing or of another type before any hook
 * fires or any row is touched.
 *
 * Batch-only: `methods/delete.ts` reaches it through `fromBatch`.
 */
export async function deleteEntryBatch(
    params: { type: string; ids: readonly string[] },
    ctx: AppContext
): Promise<void> {
    await removeEntryBatch(params, ctx, {
        permanent: true,
        async write(entry) {
            await relationshipRepository.deleteByResource(entry.id, 'entry');
            // Content rows and versions cascade from the `entries` row.
            await entryRepository.delete(entry.id);
        },
    });
}

/**
 * Soft-delete a batch of entries, atomically, firing the entry delete hooks
 * around the write. Trashing is resource-level: every locale of an entry goes
 * with it. `trash` declares `requires: 'trash'`, so the type keeps a bin.
 *
 * Batch-only: `methods/trash.ts` reaches it through `fromBatch`.
 */
export async function trashEntryBatch(
    params: { type: string; ids: readonly string[] },
    ctx: AppContext
): Promise<void> {
    await removeEntryBatch(params, ctx, {
        permanent: false,
        async write(entry) {
            // Soft delete keeps relationship rows — unlike a permanent
            // delete, a trashed entry can still be restored.
            await entryRepository.trash.trash(entry.id, ctx.user?.id ?? null);
        },
    });
}

/**
 * The sequence delete and trash share: `entry:beforeDelete` for every entry,
 * then `write` for each one in a single transaction, then `entry:afterDelete`
 * for every entry. Every id is read before any hook fires.
 */
async function removeEntryBatch(
    params: { type: string; ids: readonly string[] },
    ctx: AppContext,
    options: {
        permanent: boolean;
        write: (entry: EntryResource) => Promise<void>;
    }
): Promise<void> {
    const { type, ids } = params;
    const { permanent, write } = options;
    const entries = await getEntryResources(type, ids);
    const user = ctx.user;

    for (const entry of entries) {
        await ctx.runHook('entry:beforeDelete', {
            type,
            entry: parseOutput(entrySchema, entry, 'The entry in entry:beforeDelete'),
            user,
            permanent,
        });
    }

    await writeBatch(entries, write);

    for (const entry of entries) {
        // A throw here propagates; the write above stays (`DECISIONS.md`).
        await ctx.runHook('entry:afterDelete', {
            type,
            entry: parseOutput(entrySchema, entry, 'The entry in entry:afterDelete'),
            user,
            permanent,
        });
    }
}
