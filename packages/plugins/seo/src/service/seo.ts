/**
 * The SEO service. Paths come from each entry type's `url` template through
 * `resolveEntryPath`; a type without one is skipped, so no path is guessed.
 */

import type {
    SeoOverview,
    SeoOverviewItem,
    SeoResolvedMeta,
    SeoSitemap,
    SeoSitemapUrl,
} from '../types';
import type { Entry, PluginContext } from 'astromech';
import { defineServiceMethod, noInput, resolveEntryPath, z } from 'astromech';
import { SEO_FIELD_NAME } from '../types';
import {
    LENGTH_STATUSES,
    lengthStatus,
    SEO_DESCRIPTION_RANGE,
    SEO_TITLE_RANGE,
} from '../utilities/length';
import { parseSeoMetaValue } from '../utilities/meta-value';

export const seoSitemapUrlSchema = z.object({
    loc: z.string(),
    /** ISO timestamp of the entry's last update. */
    lastmod: z.string(),
});

export const seoSitemapSchema = z.object({ urls: z.array(seoSitemapUrlSchema) });

export const seoResolvedMetaSchema = z.object({
    title: z.string(),
    description: z.string().nullable(),
    /** Resolved URL of the default Open Graph image setting, if any. */
    ogImage: z.string().nullable(),
    path: z.string().nullable(),
});

export const seoFieldHealthSchema = z.object({
    length: z.number(),
    status: z.enum(LENGTH_STATUSES),
});

export const seoOverviewItemSchema = z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    slug: z.string().nullable(),
    entryStatus: z.string(),
    metaTitle: seoFieldHealthSchema,
    metaDescription: seoFieldHealthSchema,
});

export const seoOverviewSchema = z.object({
    totals: z.object({
        entries: z.number(),
        complete: z.number(),
        needsAttention: z.number(),
    }),
    items: z.array(seoOverviewItemSchema),
});

async function footprintEntries(
    ctx: PluginContext,
    shape: { full: boolean }
): Promise<{ type: string; entry: Entry }[]> {
    const types = ctx.config.entryTypesWithField(SEO_FIELD_NAME);
    const collected: { type: string; entry: Entry }[] = [];
    for (const type of types) {
        const { data } = await ctx.entries.query({ type, limit: 'all', ...shape });
        for (const entry of data) {
            collected.push({ type, entry });
        }
    }
    return collected;
}

/**
 * The plugin's default Open Graph image URL, read from the `settings` global
 * at the qualified key `<namespace>/settings`. Null when none is set.
 */
async function resolveDefaultOgImage(ctx: PluginContext): Promise<string | null> {
    const global = await ctx.globals.get({
        key: `${ctx.plugin.namespace}/settings`,
        full: true,
    });
    const mediaId = global?.fields['defaultOgImage'];
    if (typeof mediaId !== 'string' || mediaId === '') return null;
    const media = await ctx.media.get({ id: mediaId });
    return media?.url ?? null;
}

/** Resolve an entry's front-end path from its type's `url` template, or null. */
function entryPath(ctx: PluginContext, type: string, entry: Entry): string | null {
    const template = ctx.config.entryTypes[type]?.url;
    return template ? resolveEntryPath(template, entry) : null;
}

export const seoService = {
    /**
     * Only published entries with a path are listed. Public, so the app's
     * `/sitemap.xml` endpoint can call it.
     */
    getSitemap: defineServiceMethod({
        summary: 'List sitemap URLs for all SEO-tracked entries.',
        input: noInput(),
        output: seoSitemapSchema,
        access: 'public',
        mutates: false,
        async handler(_params, ctx): Promise<SeoSitemap> {
            const tracked = await footprintEntries(ctx, { full: false });

            const urls: SeoSitemapUrl[] = [];
            for (const { type, entry } of tracked) {
                if (entry.status !== 'published') continue;
                const loc = entryPath(ctx, type, entry);
                if (!loc) continue;
                const lastmod = new Date(entry.updatedAt).toISOString();
                urls.push({ loc, lastmod });
            }

            return { urls };
        },
    }),

    /**
     * Only a published entry resolves. An empty `seo` title falls back to the
     * entry's title, and `ogImage` is the plugin's default image setting.
     */
    getMeta: defineServiceMethod({
        summary: 'Resolve the SEO meta tags for one entry by type + slug.',
        input: z.strictObject({ type: z.string(), slug: z.string() }),
        output: seoResolvedMetaSchema.nullable(),
        access: 'public',
        mutates: false,
        async handler(params, ctx): Promise<SeoResolvedMeta | null> {
            const { type, slug } = params;
            const trackedTypes = ctx.config.entryTypesWithField(SEO_FIELD_NAME);

            if (type === '' || slug === '' || !trackedTypes.includes(type)) return null;
            const { data } = await ctx.entries.query({ type, limit: 'all' });
            const entry = data.find(
                (candidate) => candidate.slug === slug && candidate.status === 'published'
            );
            if (!entry) return null;
            const ogImage = await resolveDefaultOgImage(ctx);

            const meta = parseSeoMetaValue(entry.fields[SEO_FIELD_NAME]);

            return {
                title: meta.title?.trim() ? meta.title : entry.title,
                description: meta.description?.trim() ? meta.description : null,
                ogImage,
                path: entryPath(ctx, type, entry),
            };
        },
    }),

    /** The data behind the plugin's SEO overview dashboard page. */
    getOverview: defineServiceMethod({
        summary: 'Report SEO coverage across all tracked entries.',
        input: noInput(),
        output: seoOverviewSchema,
        access: { permission: 'read' },
        mutates: false,
        async handler(_params, ctx): Promise<SeoOverview> {
            const tracked = await footprintEntries(ctx, { full: true });

            const items: SeoOverviewItem[] = [];
            for (const { type, entry } of tracked) {
                const meta = parseSeoMetaValue(entry.fields[SEO_FIELD_NAME]);
                const titleLength = (meta.title ?? '').length;
                const descriptionLength = (meta.description ?? '').length;
                items.push({
                    id: entry.id,
                    type,
                    title: entry.title,
                    slug: entry.slug,
                    entryStatus: entry.status,
                    metaTitle: {
                        length: titleLength,
                        status: lengthStatus(titleLength, SEO_TITLE_RANGE),
                    },
                    metaDescription: {
                        length: descriptionLength,
                        status: lengthStatus(descriptionLength, SEO_DESCRIPTION_RANGE),
                    },
                });
            }
            const complete = items.filter(
                (item) =>
                    item.metaTitle.status === 'good' &&
                    item.metaDescription.status === 'good'
            ).length;

            return {
                totals: {
                    entries: items.length,
                    complete,
                    needsAttention: items.length - complete,
                },
                items,
            };
        },
    }),
};
