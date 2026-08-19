import type { EntryRepository, RepositoryDb } from '../repository/types';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { runBulkVoid } from '../internal/bulk';
import { runDeleteWithHooks } from '../internal/hooks';
import { loadAndAssertType } from '../internal/records';
import { getEntryRepository } from '../repository/registry';

export async function deleteEntry(params: {
    type: string;
    id: string | readonly string[];
    cascadeLocales?: boolean;
}): Promise<void> {
    const cascade = !!params.cascadeLocales;
    await runDeleteWithHooks(params.type, params.id, true, async () => {
        if (Array.isArray(params.id)) {
            await runBulkVoid(params.type, params.id, (txRepository, txDb, id) =>
                deleteOne(txRepository, txDb, params.type, id, cascade)
            );
            return;
        }
        await deleteOne(
            getEntryRepository(params.type),
            undefined,
            params.type,
            params.id as string,
            cascade
        );
    });
}

/** Permanently delete a single entry + its relationship rows (policy). */
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
