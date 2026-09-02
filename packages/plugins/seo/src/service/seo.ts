/**
 * Service methods for @astromech/seo. Paths come from each entry type's `url`
 * template (core's single source of truth) via `resolveEntryPath`; entry types
 * without a `url` are skipped, so the plugin never guesses a path.
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
    lengthStatus,
    SEO_DESCRIPTION_RANGE,
    SEO_TITLE_RANGE,
} from '../utilities/length';
import { parseSeoMetaValue } from '../utilities/meta-value';

async function footprintEntries(
    ctx: PluginContext
): Promise<{ type: string; entry: Entry }[]> {
    const types = ctx.config.entryTypesWithField(SEO_FIELD_NAME);
    const collected: { type: string; entry: Entry }[] = [];
    for (const type of types) {
        const { data } = await ctx.entries.query({ type, limit: 'all' });
        for (const entry of data as Entry[]) {
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
    });
    const mediaId = global?.fields['defaultOgImage'];
    if (typeof mediaId !== 'string' || mediaId === '') return null;
    const media = await ctx.media.get({ id: mediaId });
    return media?.url ?? null;
}

/** Resolve an entry's front-end path from its type's `url` template, or null. */
function entryPath(ctx: PluginContext, type: string, entry: Entry): string | null {
    const template = ctx.config.entries[type]?.url;
    return template ? resolveEntryPath(template, entry) : null;
}

export const seoService = {
    /**
     * Published entries across the plugin footprint, as sitemap URL data.
     * Public so the app's `/sitemap.xml` endpoint can call it.
     */
    sitemap: defineServiceMethod<undefined, SeoSitemap>({
        access: 'public',
        summary: 'List sitemap URLs for all SEO-tracked entries.',
        input: noInput(),
        mutates: false,
        handler: async (_input, ctx): Promise<SeoSitemap> => {
            const urls: SeoSitemapUrl[] = [];
            for (const { type, entry } of await footprintEntries(ctx)) {
                if (entry.status !== 'published') continue;
                const loc = entryPath(ctx, type, entry);
                if (!loc) continue;
                urls.push({
                    loc,
                    lastmod: new Date(entry.updatedAt).toISOString(),
                });
            }
            return { urls };
        },
    }),

    /**
     * Resolved meta for one published entry: the `seo` field with fallbacks
     * to the entry title and the default OG image setting.
     */
    meta: defineServiceMethod<{ type: string; slug: string }, SeoResolvedMeta | null>({
        access: 'public',
        summary: 'Resolve the SEO meta tags for one entry by type + slug.',
        input: z.object({ type: z.string(), slug: z.string() }),
        mutates: false,
        handler: async (input, ctx): Promise<SeoResolvedMeta | null> => {
            const type = typeof input?.type === 'string' ? input.type : null;
            const slug = typeof input?.slug === 'string' ? input.slug : null;
            if (!type || !slug) return null;
            if (!ctx.config.entryTypesWithField(SEO_FIELD_NAME).includes(type)) {
                return null;
            }

            const { data } = await ctx.entries.query({ type, limit: 'all' });
            const entry = (data as Entry[]).find(
                (candidate) => candidate.slug === slug && candidate.status === 'published'
            );
            if (!entry) return null;

            const meta = parseSeoMetaValue(entry.fields[SEO_FIELD_NAME]);
            return {
                title: meta.title?.trim() ? meta.title : entry.title,
                description: meta.description?.trim() ? meta.description : null,
                ogImage: await resolveDefaultOgImage(ctx),
                path: entryPath(ctx, type, entry),
            };
        },
    }),

    /** SEO health across every entry in the footprint — drives the overview dashboard page. */
    overview: defineServiceMethod<undefined, SeoOverview>({
        access: { permission: 'view' },
        summary: 'Report SEO coverage across all tracked entries.',
        input: noInput(),
        mutates: false,
        handler: async (_input, ctx): Promise<SeoOverview> => {
            const items: SeoOverviewItem[] = [];
            for (const { type, entry } of await footprintEntries(ctx)) {
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
