import type { Entry } from '@/types/index';
import { CapabilityError } from '../../errors';
import { assertCapability } from '../../internal/entry-type';
import { asEntry, getEntryOfType } from '../../internal/records';
import { getEntryRepository } from '../../repository/registry';

/**
 * Returns the staged copy of one locale of an entry, or null if none exists.
 * Throws if the entry does not exist in that locale or is the wrong type.
 */
export async function getStagedEntry(params: {
    type: string;
    id: string;
    locale?: string;
}): Promise<Entry | null> {
    const { type, id } = params;
    const repository = getEntryRepository(type);
    assertCapability(type, 'staging');
    const { staging } = repository;
    if (!staging) throw new CapabilityError(type, 'staging');
    const canonical = await getEntryOfType(repository, type, id, params.locale);
    const staged = await staging.getByCanonical(id, canonical.locale);
    return staged ? asEntry(staged) : null;
}
