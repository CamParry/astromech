import { createRelationshipRepository } from '@/database/repository/relationships';
import { transaction } from '@/database/transaction';
import { runHook } from '@/hooks/index';
import { getCurrentUser } from '@/request-context/index';
import { BulkOperationError } from '../errors';
import { loadEntries } from '../internal/records';
import { withLocaleSiblings } from '../internal/translatable';
import { getEntryRepository } from '../repository/registry';

/**
 * Permanently delete one or many entries, atomically per batch, firing the
 * entry delete hooks around the write. Throws if an id is missing or of
 * another type before any hook fires or any row is touched.
 */
export async function deleteEntries(params: {
    type: string;
    ids: readonly string[];
    cascadeLocales?: boolean;
}): Promise<void> {
    const { type, ids } = params;
    const repository = getEntryRepository(type);
    const entries = await loadEntries(repository, type, ids);
    const targets = params.cascadeLocales
        ? await withLocaleSiblings(repository, entries)
        : entries;
    const user = await getCurrentUser();
    const relationships = createRelationshipRepository();

    for (const entry of entries) {
        await runHook('entry:beforeDelete', { type, entry, user, permanent: true });
    }

    await transaction(async () => {
        const succeeded: string[] = [];
        for (const target of targets) {
            try {
                await relationships.deleteByResource(target.id, 'entry');
                // Versions cascade-delete via entry_versions.entry_id ON DELETE CASCADE.
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
        // A throw here propagates; the write above stays (decisions/0081).
        await runHook('entry:afterDelete', { type, entry, user, permanent: true });
    }
}
