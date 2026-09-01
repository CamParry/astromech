import { CapabilityError } from '../../errors';
import { assertCapability } from '../../internal/entry-type';
import { getEntryOfType } from '../../internal/records';
import { indexEntryRelationships } from '../../internal/relationships';
import { getEntryRepository } from '../../repository/registry';

/**
 * Discards the staged copy of one locale of an entry, dropping the index rows
 * only it held. Throws if the entry does not exist, or has no staged change.
 */
export async function deleteStagedEntry(params: {
    type: string;
    id: string;
    locale?: string;
}): Promise<void> {
    const { type, id } = params;
    const repository = getEntryRepository(type);
    assertCapability(type, 'staging');
    const { staging } = repository;
    if (!staging) throw new CapabilityError(type, 'staging');
    const canonical = await getEntryOfType(repository, type, id, params.locale);
    const staged = await staging.getByCanonical(id, canonical.locale);
    if (!staged) throw new Error(`No staged change for entry '${id}'`);
    await staging.delete({ id, locale: canonical.locale });
    // The entry keeps its other content, so this re-derives rather than deletes.
    await indexEntryRelationships(canonical, canonical.fields, type);
}
