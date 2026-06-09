/**
 * @astromech/seo
 *
 * Search metadata for any entry type: a `seo-meta` custom field (title +
 * description with non-AI length recommendations and a search preview), an
 * SEO health dashboard, a default-OG-image setting, and public `sitemap` /
 * `meta` SDK methods. The user renders `/sitemap.xml` and meta tags
 * themselves — see the README recipes; the plugin exposes data only.
 *
 * Attachment is explicit composition (spec §3.6): add `seoFields()` to an
 * entry type's `fieldGroups`. The plugin footprint — which entry types the
 * dashboard and sitemap cover — is derived from presence of the `seo-meta`
 * field, never declared.
 *
 * This is the Phase 18b validator: it stress-tests the plugin admin UI
 * surface (custom field type, tab placement, nav, pages, settings, i18n).
 */

import { definePlugin } from '@/index.js';
import type {
    Entry,
    FieldGroup,
    FieldGroupPlacement,
    PluginContext,
    PluginDefinition,
} from '@/types/index.js';
import {
    SEO_DESCRIPTION_RANGE,
    SEO_TITLE_RANGE,
    lengthStatus,
    parseSeoMetaValue,
} from './shared.js';
import type {
    SeoOverview,
    SeoOverviewItem,
    SeoResolvedMeta,
    SeoSitemap,
    SeoSitemapUrl,
} from './shared.js';

export {
    SEO_DESCRIPTION_RANGE,
    SEO_TITLE_RANGE,
    lengthStatus,
    parseSeoMetaValue,
} from './shared.js';
export type {
    LengthRange,
    LengthStatus,
    SeoFieldHealth,
    SeoMetaValue,
    SeoOverview,
    SeoOverviewItem,
    SeoResolvedMeta,
    SeoSitemap,
    SeoSitemapUrl,
} from './shared.js';

/**
 * The field name `seoFields()` attaches — also the footprint anchor:
 * `ctx.config.entryTypesWithField(SEO_FIELD_NAME)`.
 */
export const SEO_FIELD_NAME = 'seo-meta';

const PERMISSION_NAMESPACE = 'astromech-seo';
const DEFAULT_OG_IMAGE_KEY = `plugin:${PERMISSION_NAMESPACE}:defaultOgImage`;

export type SeoFieldsOptions = {
    /** Where the group renders on the edit page. Default: `'tab'`. */
    placement?: FieldGroupPlacement;
    label?: string;
    priority?: number;
};

/** Field-group factory — compose into an entry type's `fieldGroups`. */
export function seoFields(options?: SeoFieldsOptions): FieldGroup {
    return {
        name: 'seo',
        label: options?.label ?? 'SEO',
        placement: options?.placement ?? 'tab',
        priority: options?.priority ?? 50,
        fields: [
            {
                name: SEO_FIELD_NAME,
                type: 'seo-meta',
                label: 'Search appearance',
            },
        ],
    };
}

export type SeoOptions = {
    /**
     * Map an entry to the public path it is served at (used by `sitemap` and
     * `meta`). Return null to skip. Default: `/${slug}` (ignores type).
     */
    pathForEntry?: (entry: { type: string; slug: string | null }) => string | null;
};

function defaultPathForEntry(entry: { slug: string | null }): string | null {
    return entry.slug ? `/${entry.slug}` : null;
}

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

export const seo = definePlugin<SeoOptions>((options) => {
    const pathForEntry = options?.pathForEntry ?? defaultPathForEntry;

    const definition: PluginDefinition = {
        package: '@astromech/seo',
        version: '0.1.0',
        permissionNamespace: PERMISSION_NAMESPACE,

        permissions: [
            {
                key: 'view',
                label: 'View SEO overview',
                description: 'See the SEO health dashboard.',
            },
        ],

        i18n: {
            en: '@/plugins/seo/locales/en.json',
            fr: '@/plugins/seo/locales/fr.json',
        },

        fields: [
            {
                type: 'seo-meta',
                component: '@/plugins/seo/seo-meta-field.tsx',
                defaultValue: null,
                typeGen: () => '{ title?: string; description?: string }',
            },
        ],

        admin: {
            nav: [
                {
                    label: 'SEO',
                    icon: 'Search',
                    children: [
                        {
                            label: 'Overview',
                            to: '/plugin/seo/overview',
                            icon: 'Gauge',
                            permission: `plugin:${PERMISSION_NAMESPACE}:view`,
                        },
                        {
                            label: 'Settings',
                            to: '/plugin/seo/settings',
                            icon: 'Settings',
                            permission: 'settings:read',
                        },
                    ],
                },
            ],
            pages: [
                {
                    path: '/overview',
                    component: '@/plugins/seo/overview-page.tsx',
                    label: 'SEO Overview',
                    permission: `plugin:${PERMISSION_NAMESPACE}:view`,
                },
            ],
            settings: {
                fields: [
                    {
                        name: 'defaultOgImage',
                        type: 'media',
                        label: 'Default Open Graph image',
                        description:
                            'Returned by the meta SDK method when an entry has no image of its own.',
                    },
                ],
            },
        },

        sdk: {
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
        },
    };

    return definition;
});

export default seo;
