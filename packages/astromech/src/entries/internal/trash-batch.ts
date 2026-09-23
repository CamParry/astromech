import type { AppContext } from '@/types/index';
import { transaction } from '@/database/transaction';
import { CapabilityError } from '@/errors/capability';
import { BulkOperationError } from '../errors';
import { getEntryRepository } from '../repository/registry';
import { asEntry, getEntryResources } from './records';

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
    const { type, ids } = params;
    const repository = getEntryRepository(type);
    const { trash } = repository;
    if (!trash) throw new CapabilityError('entry', type, 'trash');
    const entries = await getEntryResources(ctx.config, repository, type, ids);
    const user = ctx.user;

    for (const entry of entries) {
        await ctx.runHook('entry:beforeDelete', {
            type,
            entry: asEntry(entry),
            user,
            permanent: false,
        });
    }

    await transaction(async () => {
        const succeeded: string[] = [];
        for (const target of entries) {
            try {
                // Soft delete keeps relationship rows — unlike a permanent
                // delete, a trashed entry can still be restored.
                await trash.trash(target.id, user?.id ?? null);
                succeeded.push(target.id);
            } catch (err) {
                throw new BulkOperationError({
                    failedId: target.id,
                    reason: err instanceof Error ? err.message : String(err),
                    succeededBefore: succeeded,
                    cause: err,
                });
            }
        }
    });

    for (const entry of entries) {
        // A throw here propagates; the write above stays (`DECISIONS.md`).
        await ctx.runHook('entry:afterDelete', {
            type,
            entry: asEntry(entry),
            user,
            permanent: false,
        });
    }
}
