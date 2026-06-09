/**
 * SDK methods for @astromech/seo. Built per-instance (`seoSdk(pathForEntry)`)
 * because the handlers close over the resolved `pathForEntry` option.
 */

import type { Entry, PluginContext, PluginDefinition } from '@/types/index.js';
import {
    PERMISSION_NAMESPACE,
    SEO_DESCRIPTION_RANGE,
    SEO_FIELD_NAME,
    SEO_TITLE_RANGE,
    lengthStatus,
    parseSeoMetaValue,
} from '../shared.js';
import type {
    SeoOverview,
    SeoOverviewItem,
    SeoResolvedMeta,
    SeoSitemap,
    SeoSitemapUrl,
} from '../shared.js';

const DEFAULT_OG_IMAGE_KEY = `plugin:${PERMISSION_NAMESPACE}:defaultOgImage`;

export type PathForEntry = (entry: {
    type: string;
    slug: string | null;
}) => string | null;

async function footprintEntries(
    ctx: PluginContext
): Promise<{ type: string; entry: Entry }[]> {
    const types = ctx.config.entryTypesWithField(SEO_FIELD_NAME);
    const collected: { type: string; entry: Entry }[] = [];
    for (const type of types) {
        const { data } = await ctx.sdk.entries.query({ type, limit: 'all' });
        for (const entry of data as Entry[]) {
            collected.push({ type, entry });
        }
    }
    return collected;
}

async function resolveDefaultOgImage(ctx: PluginContext): Promise<string | null> {
    const mediaId = await ctx.sdk.settings.get(DEFAULT_OG_IMAGE_KEY);
    if (typeof mediaId !== 'string' || mediaId === '') return null;
    const media = await ctx.sdk.media.get(mediaId);
    return media?.url ?? null;
}

export function seoSdk(pathForEntry: PathForEntry): NonNullable<PluginDefinition['sdk']> {
    return {
        // Published entries across the plugin footprint, as sitemap URL
        // data. Public so the app's /sitemap.xml endpoint can call it.
        sitemap: {
            access: 'public',
            handler: async (_input, ctx): Promise<SeoSitemap> => {
                const urls: SeoSitemapUrl[] = [];
                for (const { type, entry } of await footprintEntries(ctx)) {
                    if (entry.status !== 'published') continue;
                    const loc = pathForEntry({ type, slug: entry.slug });
                    if (!loc) continue;
                    urls.push({
                        loc,
                        lastmod: new Date(entry.updatedAt).toISOString(),
                    });
                }
                return { urls };
            },
        },

        // Resolved meta for one published entry: seo-meta with fallbacks
        // to the entry title and the default OG image setting.
        meta: {
            access: 'public',
            handler: async (input, ctx): Promise<SeoResolvedMeta | null> => {
                const params = (input ?? {}) as { type?: unknown; slug?: unknown };
                const type = typeof params.type === 'string' ? params.type : null;
                const slug = typeof params.slug === 'string' ? params.slug : null;
                if (!type || !slug) return null;
                if (!ctx.config.entryTypesWithField(SEO_FIELD_NAME).includes(type)) {
                    return null;
                }

                const { data } = await ctx.sdk.entries.query({
                    type,
                    limit: 'all',
                });
                const entry = (data as Entry[]).find(
                    (candidate) =>
                        candidate.slug === slug && candidate.status === 'published'
                );
                if (!entry) return null;

                const meta = parseSeoMetaValue(entry.fields[SEO_FIELD_NAME]);
                return {
                    title: meta.title?.trim() ? meta.title : entry.title,
                    description: meta.description?.trim() ? meta.description : null,
                    ogImage: await resolveDefaultOgImage(ctx),
                    path: pathForEntry({ type, slug }),
                };
            },
        },

        // SEO health across every entry in the footprint — drives the
        // overview dashboard page.
        overview: {
            access: { permission: 'view' },
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
                            status: lengthStatus(
                                descriptionLength,
                                SEO_DESCRIPTION_RANGE
                            ),
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
        },
    };
}
