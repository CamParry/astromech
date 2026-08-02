import { getEntryStorage } from '../../storage/registry.js';
import { asEntry, loadAndAssertType } from '../../internal/records.js';
import { indexEntryRelationships } from '../../internal/relationships.js';
import type { Entry, JsonObject } from '@/types/index.js';

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

    const latestNumber = await storage.versions.latestNumber(id);
    await storage.versions.create({
        entryId: id,
        versionNumber: latestNumber + 1,
        title: currentEntry.title,
        slug: currentEntry.slug,
        fields: currentEntry.fields,
        createdBy: null,
    });

    let slug = version.slug;
    if (slug && slug !== currentEntry.slug) {
        slug = await storage.uniqueSlug(type, currentEntry.locale, slug, id);
    }

    const restoredFields = (version.fields as JsonObject) ?? currentEntry.fields;
    const updated = await storage.update(id, {
        title: version.title,
        slug: slug ?? currentEntry.slug,
        fields: restoredFields,
    });

    await indexEntryRelationships(updated, restoredFields, type);

    return asEntry(updated);
}
