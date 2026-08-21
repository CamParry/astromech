import { createRelationshipRepository } from '@/database/repository/relationships';
import { transaction } from '@/database/transaction';
import { runHook } from '@/hooks/index';
import { getCurrentUser } from '@/request-context/index';
import { BulkOperationError } from '../errors';
import { requireTrash } from '../internal/entry-type';
import { loadEntries } from '../internal/records';
import { withLocaleSiblings } from '../internal/translatable';
import { getEntryRepository } from '../repository/registry';

/**
 * Soft-delete one or many entries, atomically per batch, firing the entry
 * delete hooks around the write. Throws if the type does not support trash.
 */
export async function trashEntries(params: {
    type: string;
    ids: readonly string[];
    cascadeLocales?: boolean;
}): Promise<void> {
    const { type, ids } = params;
    const repository = getEntryRepository(type);
    const trash = requireTrash(repository, type);
    const entries = await loadEntries(repository, type, ids);
    const targets = params.cascadeLocales
        ? await withLocaleSiblings(repository, entries)
        : entries;
    const user = await getCurrentUser();

    for (const entry of entries) {
        await runHook('entry:beforeDelete', { type, entry, user, permanent: false });
    }

    await transaction(async () => {
        const succeeded: string[] = [];
        for (const target of targets) {
            try {
                // Soft delete keeps relationship rows — unlike a permanent
                // delete, a trashed entry can still be restored.
                await trash.trash(target.id);
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
    const trash = requireTrash(repository, type);

    const { data: trashed } = await repository.list({
        type,
        locale: 'all',
        trashed: true,
        limit: 'all',
    });
    const relationships = createRelationshipRepository();

    await transaction(async () => {
        for (const entry of trashed) {
            await relationships.deleteByResource(entry.id, 'entry');
        }
        await trash.emptyTrash(type);
    });
}
