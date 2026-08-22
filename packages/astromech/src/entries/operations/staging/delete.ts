import { createRelationshipRepository } from '@/database/repository/relationships';
import { CapabilityError } from '../../errors';
import { assertCapability } from '../../internal/entry-type';
import { getEntryOfType } from '../../internal/records';
import { getEntryRepository } from '../../repository/registry';

/**
 * Discards the staged copy of an entry, dropping its relationship index rows.
 * Throws if the entry does not exist, or if it has no staged change.
 */
export async function deleteStagedEntry(params: {
    type: string;
    id: string;
}): Promise<void> {
    const { type, id } = params;
    const repository = getEntryRepository(type);
    assertCapability(type, 'staging');
    const { staging } = repository;
    if (!staging) throw new CapabilityError(type, 'staging');
    await getEntryOfType(repository, type, id);
    const staged = await staging.getByCanonical(id);
    if (!staged) throw new Error(`No staged change for entry '${id}'`);
    await createRelationshipRepository().deleteByResource(staged.id, 'entry');
    await repository.delete(staged.id);
}
