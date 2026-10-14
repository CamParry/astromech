import type { Entry, ResolvedEntryType } from '@/types/index';
import { ResourceValidationError } from '@/errors/resource';
import { slugify } from '@/utilities/strings';
import { entryRepository } from '../repository/entries-table';

/**
 * Derives the slug a new entry stores: the caller's, else one slugified from
 * a titled type's title, made unique per (type, locale). Returns null when the
 * type has no slug capability or there is nothing to slugify.
 */
export async function deriveSlug(params: {
    entryType: ResolvedEntryType;
    locale: string;
    title: string;
    slug: string | undefined;
}): Promise<string | null> {
    const { entryType, locale, title, slug } = params;
    if (!entryType.capabilities.slug) return null;
    const source = slug ?? (entryType.titleField !== false ? slugify(title) : null);
    if (!source) return null;
    return entryRepository.uniqueSlug(entryType.id, locale, source);
}

/**
 * Re-uniques a slug an update is changing, scoped to the entry's own locale
 * and excluding itself. An absent or unchanged slug is returned untouched, so
 * a no-op update never collides a slug with itself.
 */
export async function uniqueSlugIfChanged(params: {
    type: string;
    entry: Entry;
    slug: string | null | undefined;
}): Promise<string | null | undefined> {
    const { type, entry, slug } = params;
    if (!slug || slug === entry.slug) return slug;
    return entryRepository.uniqueSlug(type, entry.locale, slug, entry.id);
}

/**
 * Refuses a slug another live entry of the type holds in the entry's locale,
 * where `uniqueSlugIfChanged` would rename it. A draft's slug is checked this
 * way when it is saved and when it is published: the published URL is the one
 * the editor chose, or the write fails. The entry's own live slug always passes.
 */
export async function assertSlugFree(params: {
    type: string;
    entry: Entry;
    slug: string | null | undefined;
}): Promise<void> {
    const { type, entry, slug } = params;
    if (!slug || slug === entry.slug) return;
    const free = await entryRepository.uniqueSlug(type, entry.locale, slug, entry.id);
    if (free === slug) return;
    throw new ResourceValidationError([], {
        slug: [`Another entry in this locale already uses the slug "${slug}".`],
    });
}
