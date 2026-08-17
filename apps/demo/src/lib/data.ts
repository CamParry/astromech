/**
 * Thin wrappers around `app.entries.query` for common page data needs.
 * All swallow errors gracefully — missing data returns null/empty arrays.
 */
import { getAstromech } from 'astromech';
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
        const app = await getAstromech();
        const { data } = await app.entries.query({
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
        const app = await getAstromech();
        const { data } = await app.entries.query({
            type: 'post',
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

export async function getPosts(locale: Locale, limit = 20): Promise<Entry[]> {
    try {
        const app = await getAstromech();
        const { data } = await app.entries.query({
            type: 'post',
            locale,
            limit,
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
        const app = await getAstromech();
        const { data } = await app.entries.query({
            type: 'caseStudy',
            where: { slug },
            locale,
            limit: 1,
        });
        return data[0] ?? null;
    } catch {
        return null;
    }
}

export async function getCaseStudies(locale: Locale): Promise<Entry[]> {
    try {
        const app = await getAstromech();
        const { data } = await app.entries.query({
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
        const app = await getAstromech();
        const { data } = await app.entries.query({
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
        const app = await getAstromech();
        const { data } = await app.entries.query({
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
        const app = await getAstromech();
        const { data } = await app.entries.query({
            type: 'post',
            where: { references: { path: 'category', id: categoryId } },
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
        const app = await getAstromech();
        const { data } = await app.entries.query({
            type: 'post',
            where: { references: { path: 'tags', id: tagId } },
            locale,
            limit: 'all',
        });
        return data;
    } catch {
        return [];
    }
}
