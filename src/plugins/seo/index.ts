/**
 * @astromech/seo
 *
 * Search metadata for any entry type: a `seo-meta` custom field (title +
 * description with non-AI length recommendations and a search preview), an
 * SEO health dashboard, a default-OG-image setting, and public `sitemap` /
 * `meta` SDK methods. The user renders `/sitemap.xml` and meta tags
 * themselves — see the README recipes; the plugin exposes data only.
 *
 * Attachment is explicit composition (spec §3.6): add `seoSection()` to an
 * entry type's `fields`. The plugin footprint — which entry types the
 * dashboard and sitemap cover — is derived from presence of the `seo-meta`
 * field, never declared.
 *
 * This is the Phase 18b validator: it stress-tests the plugin admin UI
 * surface (custom field type, tab placement, nav, pages, settings, i18n).
 */

import { definePlugin, definePermissionBundles } from '@/index.js';
import type { PluginDefinition, SdkInterface } from '@/types/index.js';
import type { SeoOptions } from './shared.js';
import { defaultPathForEntry } from './shared.js';
import { seoMetaField } from './fields/seo-meta.js';
import { seoSdk } from './server/sdk.js';

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginSdks {
        seo: SdkInterface<ReturnType<typeof seoSdk>>;
    }
}

export { seoSection } from './fields/groups.js';
export type { SeoSectionOptions } from './fields/groups.js';
export {
    SEO_DESCRIPTION_RANGE,
    SEO_FIELD_NAME,
    SEO_TITLE_RANGE,
    lengthStatus,
    parseSeoMetaValue,
} from './shared.js';
export type {
    LengthRange,
    LengthStatus,
    SeoFieldHealth,
    SeoMetaValue,
    SeoOptions,
    SeoOverview,
    SeoOverviewItem,
    SeoResolvedMeta,
    SeoSitemap,
    SeoSitemapUrl,
} from './shared.js';

export const seoPermissions = definePermissionBundles('@astromech/seo', {
    view: ['view'],
});

export const seo = definePlugin<SeoOptions>((options) => {
    const pathForEntry = options?.pathForEntry ?? defaultPathForEntry;

    const definition: PluginDefinition = {
        package: '@astromech/seo',
        version: '0.1.0',
        label: 'SEO',
        icon: 'Search',

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

        fields: [seoMetaField],

        admin: {
            pages: [
                {
                    path: '/overview',
                    label: 'Overview',
                    icon: 'Gauge',
                    component: '@/plugins/seo/admin/pages/overview-page.tsx',
                    permission: 'view',
                },
                {
                    path: '/settings',
                    label: 'Settings',
                    icon: 'Settings',
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
            ],
        },

        sdk: seoSdk(pathForEntry),
    };

    return definition;
});

export default seo;
