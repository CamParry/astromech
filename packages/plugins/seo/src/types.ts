/**
 * Domain types and constants for @astromech/seo. Dependency-free leaf — shared
 * by the server plugin definition and the browser renderers, so it must never
 * pull in core server code.
 */

import type { LengthStatus } from './utilities/length.js';

/**
 * The field name `seoSection()` attaches — also the footprint anchor:
 * `ctx.config.entryTypesWithField(SEO_FIELD_NAME)`.
 */
export const SEO_FIELD_NAME = 'seo';

// ── SDK method shapes ───────────────────────────────────────────────────

export type SeoSitemapUrl = {
    loc: string;
    /** ISO timestamp of the entry's last update. */
    lastmod: string;
};

export type SeoSitemap = {
    urls: SeoSitemapUrl[];
};

export type SeoResolvedMeta = {
    title: string;
    description: string | null;
    /** Resolved URL of the default Open Graph image setting, if any. */
    ogImage: string | null;
    path: string | null;
};

export type SeoFieldHealth = {
    length: number;
    status: LengthStatus;
};

export type SeoOverviewItem = {
    id: string;
    type: string;
    title: string;
    slug: string | null;
    entryStatus: string;
    metaTitle: SeoFieldHealth;
    metaDescription: SeoFieldHealth;
};

export type SeoOverview = {
    totals: {
        entries: number;
        complete: number;
        needsAttention: number;
    };
    items: SeoOverviewItem[];
};
