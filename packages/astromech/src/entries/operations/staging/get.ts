import type { Entry } from '@/types/index';
import { requireStaging } from '../../internal/entry-type';
import { asEntry, loadAndAssertType } from '../../internal/records';

/**
 * Returns the staged copy of an entry, or null if none exists. Throws if the
 * entry does not exist or is the wrong type.
 */
export async function getStagedEntry(params: {
    type: string;
    id: string;
}): Promise<Entry | null> {
    const { type, id } = params;
    const { repository, staging } = requireStaging(type);
    await loadAndAssertType(repository, type, id);
    const staged = await staging.getByCanonical(id);
    return staged ? asEntry(staged) : null;
}
