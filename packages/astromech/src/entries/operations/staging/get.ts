import { asEntry, loadAndAssertType } from '../../internal/records.js';
import { getStagingStorage } from '../../internal/supports.js';
import type { Entry } from '@/types/index.js';

export async function getStaged(params: {
    type: string;
    id: string;
}): Promise<Entry | null> {
    const { type, id } = params;
    const { storage, staging } = getStagingStorage(type);
    await loadAndAssertType(storage, type, id);
    const staged = await staging.getByCanonical(id);
    return staged ? asEntry(staged) : null;
}
