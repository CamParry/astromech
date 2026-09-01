import { createRelationshipRepository } from '@/database/repository/relationships';
import { transaction } from '@/database/transaction';
import { runHook } from '@/hooks/hooks';
import { getCurrentUser } from '@/request-context/request-context';
import { BulkOperationError, CapabilityError } from '../errors';
import { assertCapability } from '../internal/entry-type';
import { getEntryResources } from '../internal/records';
import { getEntryRepository } from '../repository/registry';

/**
 * Soft-delete one or many entries, atomically per batch, firing the entry
 * delete hooks around the write. Trashing is resource-level: every locale of an
 * entry goes with it. Throws if the type does not support trash.
 */
export async function trashEntries(params: {
    type: string;
    ids: readonly string[];
}): Promise<void> {
    const { type, ids } = params;
    const repository = getEntryRepository(type);
    assertCapability(type, 'trash');
    const { trash } = repository;
    if (!trash) throw new CapabilityError(type, 'trash');
    const entries = await getEntryResources(repository, type, ids);
    const user = await getCurrentUser();

    for (const entry of entries) {
        await runHook('entry:beforeDelete', { type, entry, user, permanent: false });
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
        await runHook('entry:afterDelete', { type, entry, user, permanent: false });
    }
}

/**
 * Permanently delete every trashed entry of the type, clearing their
 * relationship rows first. Throws if the type does not support trash.
 */
export async function emptyTrash(params: { type: string }): Promise<void> {
    const { type } = params;
    const repository = getEntryRepository(type);
    assertCapability(type, 'trash');
    const { trash } = repository;
    if (!trash) throw new CapabilityError(type, 'trash');

    const { data: trashed } = await repository.list({
        type,
        locale: 'all',
        trashed: true,
        limit: 'all',
    });
    const relationships = createRelationshipRepository();

    await transaction(async () => {
        for (const entryId of new Set(trashed.map((entry) => entry.id))) {
            await relationships.deleteByResource(entryId, 'entry');
        }
        await trash.emptyTrash(type);
    });
}
