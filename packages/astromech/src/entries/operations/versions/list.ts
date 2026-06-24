import { getEntryStorage } from '../../storage/registry.js';
import { loadAndAssertType } from '../../internal/records.js';
import type { EntryVersion } from '@/types/index.js';

export async function listVersions(params: {
    type: string;
    id: string;
}): Promise<EntryVersion[]> {
    const storage = getEntryStorage(params.type);
    await loadAndAssertType(storage, params.type, params.id);
    if (!storage.versions) return [];
    return storage.versions.list(params.id);
}
