import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { getEntryStorage } from '../storage/registry.js';
import { loadAndAssertType } from '../internal/records.js';
import { runBulkVoid } from '../internal/bulk.js';
import { runDeleteWithHooks } from '../internal/hooks.js';
import type { EntryStorage, StorageDb } from '../storage/types.js';

/** Permanently delete a single entry + its relationship rows (policy). */
export async function deleteOne(
    storage: EntryStorage,
    db: StorageDb | undefined,
    type: string,
    id: string,
    cascadeLocales: boolean
): Promise<void> {
    const existing = await loadAndAssertType(storage, type, id);
    const relationshipsRepo = createRelationshipStorage(db);

    if (cascadeLocales && storage.translatable) {
        const siblings = await storage.translatable.siblings(existing.localeGroup, id);
        for (const sib of siblings) {
            await relationshipsRepo.deleteByEntry(sib.id);
        }
        await relationshipsRepo.deleteByEntry(id);
        // Versions cascade-delete via entry_versions.entry_id ON DELETE CASCADE.
        await storage.delete(id, { cascadeLocales: true });
        return;
    }

    await relationshipsRepo.deleteByEntry(id);
    await storage.delete(id);
}

export async function deleteEntry(params: {
    type: string;
    id: string | readonly string[];
    cascadeLocales?: boolean;
}): Promise<void> {
    const cascade = !!params.cascadeLocales;
    await runDeleteWithHooks(params.type, params.id, true, async () => {
        if (Array.isArray(params.id)) {
            await runBulkVoid(params.type, params.id, (txStorage, txDb, id) =>
                deleteOne(txStorage, txDb, params.type, id, cascade)
            );
            return;
        }
        await deleteOne(
            getEntryStorage(params.type),
            undefined,
            params.type,
            params.id as string,
            cascade
        );
    });
}
