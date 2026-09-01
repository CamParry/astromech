import { createRelationshipRepository } from '@/database/repository/relationships';
import { transaction } from '@/database/transaction';
import { runHook } from '@/hooks/hooks';
import { getCurrentUser } from '@/request-context/request-context';
import { BulkOperationError } from '../errors';
import { getEntryResources } from '../internal/records';
import { getEntryRepository } from '../repository/registry';

/**
 * Permanently delete one or many entries, atomically per batch, firing the
 * entry delete hooks around the write. Deleting is resource-level: every locale
 * of an entry goes with it. Throws if an id is missing or of another type
 * before any hook fires or any row is touched.
 */
export async function deleteEntries(params: {
    type: string;
    ids: readonly string[];
}): Promise<void> {
    const { type, ids } = params;
    const repository = getEntryRepository(type);
    const entries = await getEntryResources(repository, type, ids);
    const user = await getCurrentUser();
    const relationships = createRelationshipRepository();

    for (const entry of entries) {
        await runHook('entry:beforeDelete', { type, entry, user, permanent: true });
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
        await runHook('entry:afterDelete', { type, entry, user, permanent: true });
    }
}
