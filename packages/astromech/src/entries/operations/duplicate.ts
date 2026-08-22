import type { Entry, EntryDuplicateOverrides, JsonObject } from '@/types/index';
import { transaction } from '@/database/transaction';
import { asEntry, getEntryOfType } from '../internal/records';
import { indexEntryRelationships } from '../internal/relationships';
import { getEntryRepository } from '../repository/registry';

/**
 * Duplicates an entry: copies its content into a new row of the same type,
 * applying any overrides, and indexes the copy's relationships. Throws if the
 * source does not exist or is the wrong type.
 */
export async function duplicateEntry(params: {
    type: string;
    id: string;
    overrides?: EntryDuplicateOverrides;
}): Promise<Entry> {
    const { type, id, overrides } = params;

    const repository = getEntryRepository(type);
    const source = await getEntryOfType(repository, type, id);

    const locale = overrides?.locale ?? source.locale;
    const status = overrides?.status ?? 'unpublished';
    const title = overrides?.title ?? source.title;
    const mergedFields: JsonObject = {
        ...(source.fields ?? {}),
        ...(overrides?.fields ?? {}),
    };

    const baseSlug = overrides?.slug ?? source.slug;
    const slug = baseSlug ? await repository.uniqueSlug(type, locale, baseSlug) : null;

    // Write the row and its relationship index atomically.
    const created = await transaction(async () => {
        const row = await repository.create({
            type,
            title,
            slug,
            locale,
            // No override means the copy starts its own translation group; the
            // repository's table mints the ULID.
            localeGroup: overrides?.localeGroup,
            fields: mergedFields,
            status,
            publishedAt: status === 'published' ? new Date() : null,
        });
        await indexEntryRelationships(row, mergedFields, type);
        return row;
    });

    return asEntry(created);
}
