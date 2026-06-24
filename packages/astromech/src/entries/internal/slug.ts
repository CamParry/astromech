import { getEntryStorage } from '../storage/registry.js';

/**
 * @deprecated Slug uniqueness is now a storage concern. Kept for the existing
 * public export; delegates to the storage for the given type.
 */
export async function generateUniqueSlug(
    type: string,
    locale: string,
    baseSlug: string,
    excludeId?: string
): Promise<string> {
    return getEntryStorage(type).uniqueSlug(type, locale, baseSlug, excludeId);
}
