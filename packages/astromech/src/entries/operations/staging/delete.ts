import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { loadAndAssertType } from '../../internal/records.js';
import { getStagingStorage } from '../../internal/supports.js';

export async function deleteStaged(params: { type: string; id: string }): Promise<void> {
    const { type, id } = params;
    const { storage, staging } = getStagingStorage(type);
    await loadAndAssertType(storage, type, id);
    const staged = await staging.getByCanonical(id);
    if (!staged) throw new Error(`No staged change for entry '${id}'`);
    const relRepo = createRelationshipStorage();
    await relRepo.deleteByEntry(staged.id);
    await storage.delete(staged.id);
}
