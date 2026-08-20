import type { EntryRepository } from '../repository/types';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { runOnIdsVoid } from '../internal/bulk';
import { runDeleteWithHooks } from '../internal/hooks';
import { loadAndAssertType } from '../internal/records';
import { assertCapability } from '../internal/type-config';
import { getEntryRepository } from '../repository/registry';

/**
 * Soft-delete one entry or many, atomically per batch, firing the entry delete
 * hooks around the write. Throws if the type does not support trash.
 */
export async function trash(params: {
    type: string;
    id: string | readonly string[];
    cascadeLocales?: boolean;
}): Promise<void> {
    assertCapability(params.type, 'trash');
    const cascade = !!params.cascadeLocales;
    await runDeleteWithHooks(params.type, params.id, false, () =>
        runOnIdsVoid(params.type, params.id, (repository, _db, id) =>
            trashOne(repository, params.type, id, cascade)
        )
    );
}

/** Soft-delete a single entry. Throws if the type does not support trash. */
async function trashOne(
    repository: EntryRepository,
    type: string,
    id: string,
    cascadeLocales: boolean
): Promise<void> {
    await loadAndAssertType(repository, type, id);
    if (!repository.trash) throw new Error(`Entry type "${type}" does not support trash`);
    await repository.trash.trash(id, { cascadeLocales });
}

/**
 * Permanently delete every trashed entry of the type, clearing their
 * relationship rows first. Throws if the type does not support trash.
 */
export async function emptyTrash(params: { type: string }): Promise<void> {
    assertCapability(params.type, 'trash');
    const { type } = params;
    const repository = getEntryRepository(type);
    if (!repository.trash) throw new Error(`Entry type "${type}" does not support trash`);

    // Clean up relationship rows for the soon-to-be-deleted trashed entries.
    const { data: trashed } = await repository.list({
        type,
        locale: 'all',
        trashed: true,
        limit: 'all',
    });
    const relationships = createRelationshipRepository();
    for (const entry of trashed) {
        await relationships.deleteByResource(entry.id, 'entry');
    }

    await repository.trash.emptyTrash(type);
}
