import type { Entry, JsonObject } from '@/types/index';
import { transaction } from '@/database/transaction';
import { asEntry, getEntryOfType } from '../../internal/records';
import { indexEntryRelationships } from '../../internal/relationships';
import { uniqueSlugIfChanged } from '../../internal/slug';
import { snapshotVersion } from '../../internal/versions';
import { getEntryRepository } from '../../repository/registry';

/**
 * Restores an entry to one of its saved versions: overwrites the row with the
 * version's title, slug, and fields. Throws if the version does not exist or
 * belongs to another entry.
 */
export async function restoreEntryVersion(params: {
    type: string;
    id: string;
    versionId: string;
}): Promise<Entry> {
    const { type, id, versionId } = params;

    const repository = getEntryRepository(type);
    if (!repository.versions) throw new Error('Version not found');
    // The guard's narrowing does not survive into the transaction closure below.
    const versions = repository.versions;

    const version = await versions.get(versionId);
    if (!version || version.entryId !== id) {
        throw new Error('Version not found');
    }

    const currentEntry = await getEntryOfType(repository, type, id);
    const slug = await uniqueSlugIfChanged({
        repository,
        type,
        entry: currentEntry,
        slug: version.slug,
    });
    const restoredFields = (version.fields as JsonObject) ?? currentEntry.fields;

    // Snapshot the state being overwritten, update the row, and reindex it
    // atomically, so a restore is itself reversible and never leaves the row
    // and its relationship index out of step.
    const updated = await transaction(async () => {
        await snapshotVersion(versions, currentEntry);
        const row = await repository.update(id, {
            title: version.title,
            slug: slug ?? currentEntry.slug,
            fields: restoredFields,
        });
        await indexEntryRelationships(row, restoredFields, type);
        return row;
    });

    return asEntry(updated);
}
