import type { EntryRepository, RepositoryDb } from '../repository/types';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { runOnIdsVoid } from '../internal/bulk';
import { runDeleteWithHooks } from '../internal/hooks';
import { loadAndAssertType } from '../internal/records';

/**
 * Permanently delete one entry or many, atomically per batch, firing the entry
 * delete hooks around the write. Throws if an id is missing or of another type.
 */
export async function deleteEntry(params: {
    type: string;
    id: string | readonly string[];
    cascadeLocales?: boolean;
}): Promise<void> {
    const cascade = !!params.cascadeLocales;
    await runDeleteWithHooks(params.type, params.id, true, () =>
        runOnIdsVoid(params.type, params.id, (repository, db, id) =>
            deleteOne(repository, db, params.type, id, cascade)
        )
    );
}

/**
 * Permanently delete a single entry and its relationship rows. With
 * `cascadeLocales`, deletes its locale siblings' relationship rows too and
 * cascades the delete across the locale group.
 */
async function deleteOne(
    repository: EntryRepository,
    db: RepositoryDb | undefined,
    type: string,
    id: string,
    cascadeLocales: boolean
): Promise<void> {
    const existing = await loadAndAssertType(repository, type, id);
    const relationships = createRelationshipRepository(db);

    if (cascadeLocales && repository.translatable) {
        const siblings = await repository.translatable.siblings(existing.localeGroup, id);
        for (const sib of siblings) {
            await relationships.deleteByResource(sib.id, 'entry');
        }
        await relationships.deleteByResource(id, 'entry');
        // Versions cascade-delete via entry_versions.entry_id ON DELETE CASCADE.
        await repository.delete(id, { cascadeLocales: true });
        return;
    }

    await relationships.deleteByResource(id, 'entry');
    await repository.delete(id);
}
