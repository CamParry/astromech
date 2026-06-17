/**
 * @astromech/seo — search metadata for any entry type: a composed `seo` field
 * group (meta title + description + search preview), an SEO health dashboard, a
 * default-OG-image setting, and public
 * `sitemap` / `meta` SDK methods. Attach via `seoSection()` on an entry type's
 * `fields`; the footprint is derived from field presence, never declared. The
 * app renders `/sitemap.xml` and meta tags itself — see the README recipes.
 */

import { definePlugin } from '@/index.js';
import type { PluginDefinition, SdkInterface } from '@/types/index.js';
import { PACKAGE, VERSION, LABEL, ICON, locales } from './manifest.js';
import { seoPermissionDefs } from './permissions/seo.js';
import { seoPreviewField } from './fields/seo-preview.js';
import { seoSdk } from './sdk/seo.js';
import { overviewPage } from './pages/overview.js';
import { settingsPage } from './pages/settings.js';

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginSdks {
        seo: SdkInterface<typeof seoSdk>;
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

export { seoPermissions } from './permissions/seo.js';

export const seo = definePlugin(() => {
    const definition: PluginDefinition = {
        package: PACKAGE,
        version: VERSION,
        label: LABEL,
        icon: ICON,
        permissions: seoPermissionDefs,
        i18n: locales(['en', 'fr']),
        fields: [seoPreviewField],
        admin: {
            pages: [overviewPage, settingsPage],
        },
        sdk: seoSdk,
    };

    return definition;
});

export default seo;
