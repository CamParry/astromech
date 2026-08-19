import type { EntryStorage } from '../storage/types';
import type { Entry } from '@/types/index';
import { runBulk } from '../internal/bulk';
import { asEntry, loadAndAssertType } from '../internal/records';
import { assertCapability } from '../internal/type-config';
import { getEntryStorage } from '../storage/registry';

/** Restore a single trashed entry (policy). */
async function restoreOne(
    storage: EntryStorage,
    type: string,
    id: string
): Promise<Entry> {
    await loadAndAssertType(storage, type, id);
    if (!storage.trash) throw new Error(`Entry type "${type}" does not support trash`);
    return asEntry(await storage.trash.restore(id));
}

export async function restore(params: {
    type: string;
    id: string | readonly string[];
}): Promise<Entry | Entry[]> {
    assertCapability(params.type, 'trash');
    if (Array.isArray(params.id)) {
        return runBulk(params.type, params.id, (txStorage, _txDb, id) =>
            restoreOne(txStorage, params.type, id)
        );
    }
    return restoreOne(getEntryStorage(params.type), params.type, params.id as string);
}
