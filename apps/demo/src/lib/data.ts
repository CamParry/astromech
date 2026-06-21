/**
 * Thin wrappers around Astromech.entries.query for common page data needs.
 * All swallow errors gracefully — missing data returns null/empty arrays.
 */
import Astromech from 'astromech/local';
import type { Entry } from 'astromech';
import type { Locale } from './site.ts';

/**
 * Forward-versioning preview: a valid `previewToken` bypasses the publish gate
 * for the matched entry (public shape), and `staged: true` previews the staged
 * change instead of the current entry. Both ride the normal slug query.
 */
export type PreviewOptions = {
    previewToken?: string | undefined;
    staged?: boolean | undefined;
};

export async function getPageBySlug(
    slug: string,
    locale: Locale,
    preview?: PreviewOptions
): Promise<Entry | null> {
    try {
        const { data } = await Astromech.entries.query({
            type: 'page',
            where: { slug },
            locale,
            limit: 1,
            ...(preview?.previewToken ? { previewToken: preview.previewToken } : {}),
            ...(preview?.staged ? { staged: true } : {}),
        });
        return data[0] ?? null;
    } catch {
        return null;
    }
}

export async function getPostBySlug(
    slug: string,
    locale: Locale,
    preview?: PreviewOptions
): Promise<Entry | null> {
    try {
        const { data } = await Astromech.entries.query({
            type: 'post',
            where: { slug },
            locale,
            limit: 1,
            populate: ['category', 'tags', 'author', 'featured_image'],
            ...(preview?.previewToken ? { previewToken: preview.previewToken } : {}),
            ...(preview?.staged ? { staged: true } : {}),
        });
        return data[0] ?? null;
    } catch {
        return null;
    }
}

export async function getPosts(locale: Locale, limit = 20): Promise<Entry[]> {
    try {
        const { data } = await Astromech.entries.query({
            type: 'post',
            locale,
            limit,
            populate: ['category', 'featured_image'],
        });
        return data;
    } catch {
        return [];
    }
}

export async function getCaseStudyBySlug(
    slug: string,
    locale: Locale
): Promise<Entry | null> {
    try {
        const { data } = await Astromech.entries.query({
            type: 'caseStudy',
            where: { slug },
            locale,
            limit: 1,
            populate: ['logo', 'related_posts'],
        });
        return data[0] ?? null;
    } catch {
        return null;
    }
}

export async function getCaseStudies(locale: Locale): Promise<Entry[]> {
    try {
        const { data } = await Astromech.entries.query({
            type: 'caseStudy',
            locale,
            limit: 'all',
        });
        return data;
    } catch {
        return [];
    }
}

export async function getCategoryBySlug(
    slug: string,
    locale: Locale
): Promise<Entry | null> {
    try {
        const { data } = await Astromech.entries.query({
            type: 'category',
            where: { slug },
            locale,
            limit: 1,
        });
        return data[0] ?? null;
    } catch {
        return null;
    }
}

export async function getTagBySlug(slug: string, locale: Locale): Promise<Entry | null> {
    try {
        const { data } = await Astromech.entries.query({
            type: 'tag',
            where: { slug },
            locale,
            limit: 1,
        });
        return data[0] ?? null;
    } catch {
        return null;
    }
}

export async function getPostsByCategory(
    categoryId: string,
    locale: Locale
): Promise<Entry[]> {
    try {
        const { data } = await Astromech.entries.query({
            type: 'post',
            where: { category: categoryId },
            locale,
            limit: 'all',
        });
        return data;
    } catch {
        return [];
    }
}

export async function getPostsByTag(tagId: string, locale: Locale): Promise<Entry[]> {
    try {
        const { data } = await Astromech.entries.query({
            type: 'post',
            where: { tags: tagId },
            locale,
            limit: 'all',
        });
        return data;
    } catch {
        return [];
    }
}
