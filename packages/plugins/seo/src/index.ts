/**
 * @astromech/seo — search metadata for any entry type: a composed `seo` field
 * group (meta title + description + search preview), an SEO health dashboard, a
 * default-OG-image setting, and public
 * `sitemap` / `meta` service methods. Attach via `seoSection()` on an entry
 * type's `fields`; the footprint is derived from field presence, never
 * declared. The app renders `/sitemap.xml` and meta tags itself — see the
 * README recipes.
 */

import { definePlugin } from 'astromech';
import type { ServiceInterface } from 'astromech';
import { SEO_PACKAGE } from './types.js';
import { seoPermissionBundles, seoPermissionDefs } from './permissions/seo.js';
import { seoPreviewField } from './fields/seo-preview.js';
import { seoService } from './service/seo.js';
import { overviewPage } from './pages/overview.js';
import { settingsPage } from './pages/settings.js';

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginServices {
        seo: ServiceInterface<typeof seoService>;
    }
}

export { seoSection } from './fields/groups.js';
export type { SeoSectionOptions } from './fields/groups.js';
export { SEO_FIELD_NAME } from './types.js';
export type {
    SeoFieldHealth,
    SeoOverview,
    SeoOverviewItem,
    SeoResolvedMeta,
    SeoSitemap,
    SeoSitemapUrl,
} from './types.js';
export {
    SEO_DESCRIPTION_RANGE,
    SEO_TITLE_RANGE,
    lengthStatus,
} from './utilities/length.js';
export type { LengthRange, LengthStatus } from './utilities/length.js';
export { parseSeoMetaValue } from './utilities/meta-value.js';
export type { SeoMetaValue } from './utilities/meta-value.js';

export const seo = definePlugin({
    package: SEO_PACKAGE,
    version: '0.1.0',
    label: 'SEO',
    icon: 'Search',
    permissions: seoPermissionDefs,
    permissionBundles: seoPermissionBundles,
    i18n: ['en', 'fr'],
    fields: [seoPreviewField],
    admin: {
        pages: [overviewPage, settingsPage],
    },
    service: seoService,
});

export default seo;
