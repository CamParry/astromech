import { asEntry, loadAndAssertType } from '../../internal/records';
import { getStagingStorage } from '../../internal/type-config';
import { indexEntryRelationships } from '../../internal/relationships';
import { StagedEntryExistsError } from '../../errors';
import type { Entry, JsonObject } from '@/types/index';

export async function createStaged(params: { type: string; id: string }): Promise<Entry> {
    const { type, id } = params;
    const { storage, staging } = getStagingStorage(type);
    const canonical = await loadAndAssertType(storage, type, id);
    if (canonical.stagedFor != null) {
        throw new Error(`Entry '${id}' is itself a staged change and cannot be staged.`);
    }

    const existing = await staging.getByCanonical(id);
    if (existing) {
        throw new StagedEntryExistsError({ canonicalId: id, stagedId: existing.id });
    }

    // A staged row copies the canonical's content but gets a FRESH localeGroup
    // (it does not join the canonical's translation group) and is always
    // unpublished. The slug is shared with the canonical (kept as-is). Passing no
    // localeGroup is what asks storage's table to mint a fresh one.
    const created = await storage.create({
        type,
        title: canonical.title,
        slug: canonical.slug,
        locale: canonical.locale,
        fields: canonical.fields,
        status: 'unpublished',
        stagedFor: id,
        publishedAt: null,
    });

    await indexEntryRelationships(created, canonical.fields as JsonObject, type);

    return asEntry(created);
}
