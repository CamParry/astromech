import { getEntryStorage } from '../../storage/registry';
import { loadAndAssertType } from '../../internal/records';
import type { EntryVersion } from '@/types/index';

export async function listVersions(params: {
    type: string;
    id: string;
}): Promise<EntryVersion[]> {
    const storage = getEntryStorage(params.type);
    await loadAndAssertType(storage, params.type, params.id);
    if (!storage.versions) return [];
    return storage.versions.list(params.id);
}
