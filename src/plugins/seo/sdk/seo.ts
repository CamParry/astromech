/**
 * SDK methods for @astromech/seo. Paths come from each entry type's `url`
 * template (core's single source of truth) via `resolveEntryPath`; entry types
 * without a `url` are skipped, so the plugin never guesses a path.
 */

import type { Entry, PluginContext } from '@/types/index.js';
import { defineServiceMethod } from '@/index.js';
import { resolveEntryPath } from '@/utilities/entry-url.js';
import { PERMISSION_NAMESPACE } from '../manifest.js';
import { SEO_FIELD_NAME } from '../types.js';
import type {
    SeoOverview,
    SeoOverviewItem,
    SeoResolvedMeta,
    SeoSitemap,
    SeoSitemapUrl,
} from '../types.js';
import { lengthStatus, SEO_DESCRIPTION_RANGE, SEO_TITLE_RANGE } from '../utilities/length.js';
import { parseSeoMetaValue } from '../utilities/meta-value.js';

/**
 * Settings page blob key for the SEO plugin. The settings page has
 * `path: '/settings'`, so the blob lives at `plugin:<ns>:/settings`.
 */
const SEO_SETTINGS_KEY = `plugin:${PERMISSION_NAMESPACE}:/settings`;

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
    const blob = await ctx.sdk.settings.get(SEO_SETTINGS_KEY);
    if (blob === null || typeof blob !== 'object' || Array.isArray(blob)) return null;
    const mediaId = (blob as Record<string, unknown>).defaultOgImage;
    if (typeof mediaId !== 'string' || mediaId === '') return null;
    const media = await ctx.sdk.media.get(mediaId);
    return media?.url ?? null;
}

/** Resolve an entry's front-end path from its type's `url` template, or null. */
function entryPath(ctx: PluginContext, type: string, entry: Entry): string | null {
    const template = ctx.config.entries[type]?.url;
    return template ? resolveEntryPath(template, entry) : null;
}

export const seoSdk = {
    // Published entries across the plugin footprint, as sitemap URL data.
    // Public so the app's /sitemap.xml endpoint can call it.
    // `void` input: takes no argument, so callers invoke `.sitemap()` bare.
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    sitemap: defineServiceMethod<void, SeoSitemap>({
        access: 'public',
        summary: 'List sitemap URLs for all SEO-tracked entries.',
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

    // Resolved meta for one published entry: the `seo` field with fallbacks to
    // the entry title and the default OG image setting.
    meta: defineServiceMethod<{ type: string; slug: string }, SeoResolvedMeta | null>({
        access: 'public',
        summary: 'Resolve the SEO meta tags for one entry by type + slug.',
        mutates: false,
        handler: async (input, ctx): Promise<SeoResolvedMeta | null> => {
            const type = typeof input?.type === 'string' ? input.type : null;
            const slug = typeof input?.slug === 'string' ? input.slug : null;
            if (!type || !slug) return null;
            if (!ctx.config.entryTypesWithField(SEO_FIELD_NAME).includes(type)) {
                return null;
            }

            const { data } = await ctx.sdk.entries.query({ type, limit: 'all' });
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
                path: entryPath(ctx, type, entry),
            };
        },
    }),

    // SEO health across every entry in the footprint — drives the overview
    // dashboard page.
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    overview: defineServiceMethod<void, SeoOverview>({
        access: { permission: 'view' },
        summary: 'Report SEO coverage across all tracked entries.',
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
