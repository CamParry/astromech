import type { Entry, JsonObject } from '@/types/index';
import { transaction } from '@/database/transaction';
import { CapabilityError, StagedEntryExistsError } from '../../errors';
import { assertCapability } from '../../internal/entry-type';
import { asEntry, getEntryOfType } from '../../internal/records';
import { indexEntryRelationships } from '../../internal/relationships';
import { getEntryRepository } from '../../repository/registry';

/**
 * Creates a staged copy of a canonical entry so edits can be drafted off the
 * live row. Throws if the entry is itself a staged change, or if a staged copy
 * already exists.
 */
export async function createStagedEntry(params: {
    type: string;
    id: string;
}): Promise<Entry> {
    const { type, id } = params;

    const repository = getEntryRepository(type);
    assertCapability(type, 'staging');
    const { staging } = repository;
    if (!staging) throw new CapabilityError(type, 'staging');

    const canonical = await getEntryOfType(repository, type, id);

    if (canonical.stagedFor != null) {
        throw new Error(`Entry '${id}' is itself a staged change and cannot be staged.`);
    }

    const existing = await staging.getByCanonical(id);
    if (existing) {
        throw new StagedEntryExistsError({ canonicalId: id, stagedId: existing.id });
    }

    // A staged row copies the canonical's content but gets a FRESH
    // localeGroup (it does not join the canonical's translation group) and is
    // always unpublished. The slug is shared with the canonical (kept as-is).
    // Passing no localeGroup is what asks the repository's table to mint a fresh one.
    // Write the row and its relationship index atomically.
    const created = await transaction(async () => {
        const row = await repository.create({
            type,
            title: canonical.title,
            slug: canonical.slug,
            locale: canonical.locale,
            fields: canonical.fields,
            status: 'unpublished',
            stagedFor: id,
            publishedAt: null,
        });
        await indexEntryRelationships(row, canonical.fields as JsonObject, type);
        return row;
    });

    return asEntry(created);
}
