import { createRelationshipStorage } from '@/database/storage/relationships.js';
import { getEntryStorage } from '../storage/registry.js';
import { asEntry, loadAndAssertType } from '../internal/records.js';
import type { Entry, EntryDuplicateOverrides, JsonObject } from '@/types/index.js';

export async function duplicate(params: {
    type: string;
    id: string;
    overrides?: EntryDuplicateOverrides;
}): Promise<Entry> {
    const { type, id, overrides } = params;
    const storage = getEntryStorage(type);
    const source = await loadAndAssertType(storage, type, id);

    const locale = overrides?.locale ?? source.locale;
    const localeGroup = overrides?.localeGroup ?? crypto.randomUUID();
    const status = overrides?.status ?? 'unpublished';
    const title = overrides?.title ?? source.title;
    const mergedFields: JsonObject = {
        ...(source.fields ?? {}),
        ...(overrides?.fields ?? {}),
    };

    const baseSlug = overrides?.slug ?? source.slug;
    const slug = baseSlug ? await storage.uniqueSlug(type, locale, baseSlug) : null;

    const created = await storage.create({
        type,
        title,
        slug,
        locale,
        localeGroup,
        fields: mergedFields,
        status,
        publishedAt: status === 'published' ? new Date() : null,
    });

    const relationshipsRepo = createRelationshipStorage();
    const originalRels = await relationshipsRepo.getBySource(id, 'entry');

    for (const rel of originalRels) {
        await relationshipsRepo.create({
            sourceId: created.id,
            sourceType: 'entry',
            name: rel.name,
            targetId: rel.targetId,
            targetType: rel.targetType,
            position: rel.position,
        });
    }

    return asEntry(created);
}
