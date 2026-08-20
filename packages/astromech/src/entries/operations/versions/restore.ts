import type { Entry, JsonObject } from '@/types/index';
import { asEntry, loadAndAssertType } from '../../internal/records';
import { indexEntryRelationships } from '../../internal/relationships';
import { uniqueSlugIfChanged } from '../../internal/slug';
import { snapshotVersion } from '../../internal/versions';
import { getEntryRepository } from '../../repository/registry';

/**
 * Restores an entry to one of its saved versions: overwrites the row with the
 * version's title, slug, and fields. Throws if the version does not exist or
 * belongs to another entry.
 */
export async function restoreVersion(params: {
    type: string;
    id: string;
    versionId: string;
}): Promise<Entry> {
    const { type, id, versionId } = params;

    // Lookups
    const repository = getEntryRepository(type);
    if (!repository.versions) throw new Error('Version not found');

    const version = await repository.versions.get(versionId);
    if (!version || version.entryId !== id) {
        throw new Error('Version not found');
    }

    const currentEntry = await loadAndAssertType(repository, type, id);

    // Snapshot the current state before it is overwritten, so a restore is
    // itself reversible.
    await snapshotVersion(repository.versions, currentEntry);

    // Persist
    const slug = await uniqueSlugIfChanged(repository, type, currentEntry, version.slug);

    const restoredFields = (version.fields as JsonObject) ?? currentEntry.fields;
    const updated = await repository.update(id, {
        title: version.title,
        slug: slug ?? currentEntry.slug,
        fields: restoredFields,
    });

    await indexEntryRelationships(updated, restoredFields, type);

    return asEntry(updated);
}
