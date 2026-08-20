/**
 * @astromech/seo — search metadata for any entry type: a composed `seo` field
 * group, an SEO health dashboard, a default-OG-image setting, and public
 * `sitemap` / `meta` service methods. Attach via `seoSection()` on an entry type's `fields`.
 */

import type { ServiceInterface } from 'astromech';
import { definePlugin } from 'astromech';
import { seoPreviewField } from './fields/seo-preview';
import { overviewPage } from './pages/overview';
import { settingsPage } from './pages/settings';
import { seoPermissions } from './permissions/seo';
import { seoService } from './service/seo';

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginServices {
        seo: ServiceInterface<typeof seoService>;
    }
}

export { seoSection } from './fields/groups';
export type { SeoSectionOptions } from './fields/groups';
export { SEO_FIELD_NAME } from './types';
export type {
    SeoFieldHealth,
    SeoOverview,
    SeoOverviewItem,
    SeoResolvedMeta,
    SeoSitemap,
    SeoSitemapUrl,
} from './types';
export { SEO_DESCRIPTION_RANGE, SEO_TITLE_RANGE, lengthStatus } from './utilities/length';
export type { LengthRange, LengthStatus } from './utilities/length';
export { parseSeoMetaValue } from './utilities/meta-value';
export type { SeoMetaValue } from './utilities/meta-value';

export const seo = definePlugin({
    package: '@astromech/seo',
    version: '0.1.0',
    label: 'SEO',
    icon: 'Search',
    permissions: seoPermissions,
    i18n: ['en', 'fr'],
    fields: [seoPreviewField],
    admin: {
        pages: [overviewPage, settingsPage],
    },
    service: seoService,
});

export default seo;
