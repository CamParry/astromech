import type { Entry } from '@/types/index';
import { asEntry, loadAndAssertType } from '../../internal/records';
import { getStagingStorage } from '../../internal/type-config';

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
