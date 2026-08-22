/**
 * Slug derivation for the entry write paths: turn a title or a caller's slug
 * into the value an entry stores, made unique per (type, locale).
 */

import type { EntryRepository } from '../repository/types';
import type { Entry, ResolvedEntryType } from '@/types/index';
import { slugify } from '@/utilities/strings';

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
export async function uniqueSlugIfChanged(params: {
    repository: EntryRepository;
    type: string;
    entry: Entry;
    slug: string | null | undefined;
}): Promise<string | null | undefined> {
    const { repository, type, entry, slug } = params;
    if (!slug || slug === entry.slug) return slug;
    return repository.uniqueSlug(type, entry.locale, slug, entry.id);
}
