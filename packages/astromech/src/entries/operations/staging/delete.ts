import { createRelationshipRepository } from '@/database/repository/relationships';
import { loadAndAssertType } from '../../internal/records';
import { getStagingRepository } from '../../internal/type-config';

/**
 * Discards the staged copy of an entry, dropping its relationship index rows.
 * Throws if the entry does not exist, or if it has no staged change.
 */
export async function deleteStaged(params: { type: string; id: string }): Promise<void> {
    const { type, id } = params;
    const { repository, staging } = getStagingRepository(type);
    await loadAndAssertType(repository, type, id);
    const staged = await staging.getByCanonical(id);
    if (!staged) throw new Error(`No staged change for entry '${id}'`);
    await createRelationshipRepository().deleteByResource(staged.id, 'entry');
    await repository.delete(staged.id);
}
