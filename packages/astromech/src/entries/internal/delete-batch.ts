import type { EntryRepository } from '../repository/types';
import type { EntryWithContentId } from './read-entry';
import type { AppContext } from '@/types/index';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { CapabilityError } from '@/errors/capability';
import { getEntryRepository } from '../repository/registry';
import { getEntryResources, toEntry } from './read-entry';
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
    const repository = getEntryRepository(params.type);
    const relationships = createRelationshipRepository();

    await removeEntryBatch(params, ctx, {
        repository,
        permanent: true,
        async write(entry) {
            await relationships.deleteByResource(entry.id, 'entry');
            // Content rows and versions cascade from the `entries` row.
            await repository.delete(entry.id);
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
    const repository = getEntryRepository(params.type);
    const { trash } = repository;
    if (!trash) throw new CapabilityError('entry', params.type, 'trash');

    await removeEntryBatch(params, ctx, {
        repository,
        permanent: false,
        async write(entry) {
            // Soft delete keeps relationship rows — unlike a permanent
            // delete, a trashed entry can still be restored.
            await trash.trash(entry.id, ctx.user?.id ?? null);
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
        repository: EntryRepository;
        permanent: boolean;
        write: (entry: EntryWithContentId) => Promise<void>;
    }
): Promise<void> {
    const { type, ids } = params;
    const { repository, permanent, write } = options;
    const entries = await getEntryResources(repository, type, ids);
    const user = ctx.user;

    for (const entry of entries) {
        await ctx.runHook('entry:beforeDelete', {
            type,
            entry: toEntry(entry),
            user,
            permanent,
        });
    }

    await writeBatch(entries, write);

    for (const entry of entries) {
        // A throw here propagates; the write above stays (`DECISIONS.md`).
        await ctx.runHook('entry:afterDelete', {
            type,
            entry: toEntry(entry),
            user,
            permanent,
        });
    }
}
