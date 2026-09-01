import type { Entry } from '@/types/index';
import { transaction } from '@/database/transaction';
import { getCurrentUser } from '@/request-context/request-context';
import { CapabilityError, StagedEntryExistsError } from '../../errors';
import { assertCapability } from '../../internal/entry-type';
import { asEntry, getEntryOfType } from '../../internal/records';
import { indexEntryRelationships } from '../../internal/relationships';
import { getEntryRepository } from '../../repository/registry';

/**
 * Creates a staged copy of one locale of an entry so edits can be drafted off
 * the live row. Throws if that locale already has a staged change.
 */
export async function createStagedEntry(params: {
    type: string;
    id: string;
    locale?: string;
}): Promise<Entry> {
    const { type, id } = params;

    const repository = getEntryRepository(type);
    assertCapability(type, 'staging');
    const { staging } = repository;
    if (!staging) throw new CapabilityError(type, 'staging');

    const canonical = await getEntryOfType(repository, type, id, params.locale);
    const user = await getCurrentUser();

    const existing = await staging.getByCanonical(id, canonical.locale);
    if (existing) {
        throw new StagedEntryExistsError({ canonicalId: id, stagedId: existing.id });
    }

    // The staged row copies the canonical's content — slug included, which the
    // partial unique index allows — and is always unpublished. Write it and its
    // relationship index atomically.
    const created = await transaction(async () => {
        const row = await staging.create(
            { id, locale: canonical.locale },
            {
                title: canonical.title,
                slug: canonical.slug,
                fields: canonical.fields,
                status: 'unpublished',
                publishedAt: null,
                createdBy: user?.id ?? null,
                updatedBy: user?.id ?? null,
            }
        );
        await indexEntryRelationships(row, canonical.fields, type);
        return row;
    });

    return asEntry(created);
}
