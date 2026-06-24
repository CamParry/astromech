import config from 'virtual:astromech/config';
import { flattenEntryFields } from '@/fields/helpers.js';
import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { resolveEntryType } from '../../type-registry.js';
import { getEntryStorage } from '../../storage/registry.js';
import { asEntry, loadAndAssertType } from '../../internal/records.js';
import { buildRelationsSnapshot } from '../../internal/relationships.js';
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

    const currentRelations = await buildRelationsSnapshot(id);
    const latestNumber = await storage.versions.latestNumber(id);
    await storage.versions.create({
        entryId: id,
        versionNumber: latestNumber + 1,
        title: currentEntry.title,
        slug: currentEntry.slug,
        fields: currentEntry.fields,
        relations: currentRelations,
        createdBy: null,
    });

    let slug = version.slug;
    if (slug && slug !== currentEntry.slug) {
        slug = await storage.uniqueSlug(type, currentEntry.locale, slug, id);
    }

    const updated = await storage.update(id, {
        title: version.title,
        slug: slug ?? currentEntry.slug,
        fields: (version.fields as JsonObject) ?? currentEntry.fields,
    });

    if (version.relations) {
        const relRepo = createRelationshipStorage();
        for (const [fieldName, targetIds] of Object.entries(
            version.relations as Record<string, unknown>
        )) {
            const ids = Array.isArray(targetIds)
                ? (targetIds as string[])
                : [targetIds as string];
            const entryTypeConfig = resolveEntryType(config, type);
            let targetType: 'entry' | 'user' | 'media' = 'entry';
            if (entryTypeConfig) {
                const field = flattenEntryFields(entryTypeConfig.fields).find(
                    (f) => f.name === fieldName
                );
                if (field?.type === 'relationship' && field.target === 'users') {
                    targetType = 'user';
                }
            }
            await relRepo.replaceAll(id, 'entry', fieldName, ids, targetType);
        }
    }

    return asEntry(updated);
}
