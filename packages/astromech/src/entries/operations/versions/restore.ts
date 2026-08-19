import type { Entry, JsonObject } from '@/types/index';
import { asEntry, loadAndAssertType } from '../../internal/records';
import { indexEntryRelationships } from '../../internal/relationships';
import { uniqueSlugIfChanged } from '../../internal/slug';
import { snapshotVersion } from '../../internal/versions';
import { getEntryStorage } from '../../storage/registry';

export async function restoreVersion(params: {
    type: string;
    id: string;
    versionId: string;
}): Promise<Entry> {
    const { type, id, versionId } = params;
    const storage = getEntryStorage(type);
    if (!storage.versions) throw new Error('Version not found');

    const version = await storage.versions.get(versionId);
    if (!version || version.entryId !== id) {
        throw new Error('Version not found');
    }

    const currentEntry = await loadAndAssertType(storage, type, id);

    await snapshotVersion(storage.versions, currentEntry);

    const slug = await uniqueSlugIfChanged(storage, type, currentEntry, version.slug);

    const restoredFields = (version.fields as JsonObject) ?? currentEntry.fields;
    const updated = await storage.update(id, {
        title: version.title,
        slug: slug ?? currentEntry.slug,
        fields: restoredFields,
    });

    await indexEntryRelationships(updated, restoredFields, type);

    return asEntry(updated);
}
