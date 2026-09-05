import type { AppContext } from '@/types/index';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { transaction } from '@/database/transaction';
import { BulkOperationError } from '../errors';
import { getEntryRepository } from '../repository/registry';
import { asEntry, getEntryResources } from './records';

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
    const { type, ids } = params;
    const repository = getEntryRepository(type);
    const entries = await getEntryResources(ctx.config, repository, type, ids);
    const user = ctx.user;
    const relationships = createRelationshipRepository();

    for (const entry of entries) {
        await ctx.runHook('entry:beforeDelete', {
            type,
            entry: asEntry(entry),
            user,
            permanent: true,
        });
    }

    await transaction(async () => {
        const succeeded: string[] = [];
        for (const target of entries) {
            try {
                await relationships.deleteByResource(target.id, 'entry');
                // Content rows and versions cascade from the `entries` row.
                await repository.delete(target.id);
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
            permanent: true,
        });
    }
}
