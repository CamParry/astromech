import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { getEntryStorage } from '../storage/registry.js';
import { loadAndAssertType } from '../internal/records.js';
import { assertCapability } from '../internal/supports.js';
import { runBulkVoid } from '../internal/bulk.js';
import { runDeleteWithHooks } from '../internal/hooks.js';
import type { EntryStorage } from '../storage/types.js';

/** Soft-delete a single entry (policy). */
async function trashOne(
    storage: EntryStorage,
    type: string,
    id: string,
    cascadeLocales: boolean
): Promise<void> {
    await loadAndAssertType(storage, type, id);
    if (!storage.trash) throw new Error(`Entry type "${type}" does not support trash`);
    await storage.trash.trash(id, { cascadeLocales });
}

export async function trash(params: {
    type: string;
    id: string | readonly string[];
    cascadeLocales?: boolean;
}): Promise<void> {
    assertCapability(params.type, 'trash');
    const cascade = !!params.cascadeLocales;
    await runDeleteWithHooks(params.type, params.id, false, async () => {
        if (Array.isArray(params.id)) {
            await runBulkVoid(params.type, params.id, (txStorage, _txDb, id) =>
                trashOne(txStorage, params.type, id, cascade)
            );
            return;
        }
        await trashOne(
            getEntryStorage(params.type),
            params.type,
            params.id as string,
            cascade
        );
    });
}

export async function emptyTrash(params: { type: string }): Promise<void> {
    assertCapability(params.type, 'trash');
    const { type } = params;
    const storage = getEntryStorage(type);
    if (!storage.trash) throw new Error(`Entry type "${type}" does not support trash`);

    // Clean up relationship rows for the soon-to-be-deleted trashed entries.
    const { data: trashed } = await storage.list({
        type,
        locale: 'all',
        trashed: true,
        limit: 'all',
    });
    const relationshipsRepo = createRelationshipStorage();
    for (const entry of trashed) {
        await relationshipsRepo.deleteByEntry(entry.id);
    }

    await storage.trash.emptyTrash(type);
}
