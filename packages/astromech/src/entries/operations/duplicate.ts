import { getEntryStorage } from '../storage/registry.js';
import { asEntry, loadAndAssertType } from '../internal/records.js';
import { indexEntryRelationships } from '../internal/relationships.js';
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
        // No override means the copy starts its own translation group; storage's
        // descriptor mints the ULID.
        localeGroup: overrides?.localeGroup,
        fields: mergedFields,
        status,
        publishedAt: status === 'published' ? new Date() : null,
    });

    await indexEntryRelationships(created, mergedFields, type);

    return asEntry(created);
}
