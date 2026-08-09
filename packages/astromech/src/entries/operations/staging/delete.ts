import { createRelationshipStorage } from '@/database/storage/relationships';
import { loadAndAssertType } from '../../internal/records';
import { getStagingStorage } from '../../internal/type-config';

export async function deleteStaged(params: { type: string; id: string }): Promise<void> {
    const { type, id } = params;
    const { storage, staging } = getStagingStorage(type);
    await loadAndAssertType(storage, type, id);
    const staged = await staging.getByCanonical(id);
    if (!staged) throw new Error(`No staged change for entry '${id}'`);
    await createRelationshipStorage().deleteByResource(staged.id, 'entry');
    await storage.delete(staged.id);
}
