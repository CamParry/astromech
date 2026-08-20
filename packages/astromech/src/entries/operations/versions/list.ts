import type { EntryVersion } from '@/types/index';
import { loadAndAssertType } from '../../internal/records';
import { getEntryRepository } from '../../repository/registry';

/**
 * Lists an entry's saved versions. Returns an empty array when the type keeps
 * no version history. Throws if the entry does not exist or is the wrong type.
 */
export async function listVersions(params: {
    type: string;
    id: string;
}): Promise<EntryVersion[]> {
    const repository = getEntryRepository(params.type);
    await loadAndAssertType(repository, params.type, params.id);
    if (!repository.versions) return [];
    return repository.versions.list(params.id);
}
