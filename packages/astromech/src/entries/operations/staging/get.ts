import type { Entry } from '@/types/index';
import { asEntry, loadAndAssertType } from '../../internal/records';
import { getStagingRepository } from '../../internal/type-config';

/**
 * Returns the staged copy of an entry, or null if none exists. Throws if the
 * entry does not exist or is the wrong type.
 */
export async function getStagedEntry(params: {
    type: string;
    id: string;
}): Promise<Entry | null> {
    const { type, id } = params;
    const { repository, staging } = getStagingRepository(type);
    await loadAndAssertType(repository, type, id);
    const staged = await staging.getByCanonical(id);
    return staged ? asEntry(staged) : null;
}
