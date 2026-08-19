import type { EntryVersion } from '@/types/index';
import { loadAndAssertType } from '../../internal/records';
import { getEntryRepository } from '../../repository/registry';

export async function listVersions(params: {
    type: string;
    id: string;
}): Promise<EntryVersion[]> {
    const repository = getEntryRepository(params.type);
    await loadAndAssertType(repository, params.type, params.id);
    if (!repository.versions) return [];
    return repository.versions.list(params.id);
}
