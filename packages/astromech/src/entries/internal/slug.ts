import type { EntryRepository } from '../repository/types';
import type { Entry, ResolvedEntryType } from '@/types/index';
import { slugify } from '@/utilities/strings';
import { getEntryRepository } from '../repository/registry';

/**
 * Derives the slug a new entry stores: the caller's, else one slugified from
 * a titled type's title, made unique per (type, locale). Returns null when the
 * type has no slug capability or there is nothing to slugify.
 */
export async function deriveSlug(params: {
    repository: EntryRepository;
    entryType: ResolvedEntryType;
    locale: string;
    title: string;
    slug: string | undefined;
}): Promise<string | null> {
    const { repository, entryType, locale, title, slug } = params;
    if (!entryType.capabilities.slug) return null;
    const source = slug ?? (entryType.titleField !== false ? slugify(title) : null);
    if (!source) return null;
    return repository.uniqueSlug(entryType.id, locale, source);
}

/**
 * Re-uniques a slug an update is changing, scoped to the entry's own locale
 * and excluding itself. An absent or unchanged slug is returned untouched, so
 * a no-op update never collides a slug with itself.
 */
export async function uniqueSlugIfChanged(
    repository: EntryRepository,
    type: string,
    entry: Entry,
    slug: string | null | undefined
): Promise<string | null | undefined> {
    if (!slug || slug === entry.slug) return slug;
    return repository.uniqueSlug(type, entry.locale, slug, entry.id);
}

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
    return getEntryRepository(type).uniqueSlug(type, locale, baseSlug, excludeId);
}
