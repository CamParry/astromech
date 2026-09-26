/**
 * Domain types and constants for @astromech/seo. Dependency-free leaf — shared
 * by the server plugin definition and the browser renderers, so it must never
 * pull in core server code. The result types are inferred from the service's
 * output schemas through type-only imports, which leave nothing at runtime.
 */

import type {
    seoFieldHealthSchema,
    seoOverviewItemSchema,
    seoOverviewSchema,
    seoResolvedMetaSchema,
    seoSitemapSchema,
    seoSitemapUrlSchema,
} from './service/seo';
import type { z } from 'astromech';

/**
 * The field name `seo.section()` attaches — also the footprint anchor:
 * `ctx.config.entryTypesWithField(SEO_FIELD_NAME)`.
 */
export const SEO_FIELD_NAME = 'seo';

export type SeoSitemapUrl = z.output<typeof seoSitemapUrlSchema>;

export type SeoSitemap = z.output<typeof seoSitemapSchema>;

export type SeoResolvedMeta = z.output<typeof seoResolvedMetaSchema>;

export type SeoFieldHealth = z.output<typeof seoFieldHealthSchema>;

export type SeoOverviewItem = z.output<typeof seoOverviewItemSchema>;

export type SeoOverview = z.output<typeof seoOverviewSchema>;
