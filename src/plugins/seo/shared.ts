/**
 * Shared between the server-side plugin definition (index.ts) and the
 * browser-side renderers (seo-meta-field.tsx, overview-page.tsx). Must stay
 * dependency-free — the browser modules must not pull core server code.
 */

/**
 * The field name `seoFields()` attaches — also the footprint anchor:
 * `ctx.config.entryTypesWithField(SEO_FIELD_NAME)`.
 */
export const SEO_FIELD_NAME = 'seo-meta';

export const PERMISSION_NAMESPACE = 'astromech-seo';

export type SeoOptions = {
    /**
     * Map an entry to the public path it is served at (used by `sitemap` and
     * `meta`). Return null to skip. Default: `/${slug}` (ignores type).
     */
    pathForEntry?: (entry: { type: string; slug: string | null }) => string | null;
};

export function defaultPathForEntry(entry: { slug: string | null }): string | null {
    return entry.slug ? `/${entry.slug}` : null;
}

export type SeoMetaValue = {
    title?: string;
    description?: string;
};

export type LengthRange = {
    min: number;
    max: number;
};

/** Search engines typically truncate titles past ~60 characters. */
export const SEO_TITLE_RANGE: LengthRange = { min: 30, max: 60 };
/** Meta descriptions are typically truncated past ~160 characters. */
export const SEO_DESCRIPTION_RANGE: LengthRange = { min: 70, max: 160 };

export type LengthStatus = 'empty' | 'short' | 'good' | 'long';

export function lengthStatus(length: number, range: LengthRange): LengthStatus {
    if (length === 0) return 'empty';
    if (length < range.min) return 'short';
    if (length <= range.max) return 'good';
    return 'long';
}

/** Tolerant read of a stored seo-meta value (never trust persisted shapes). */
export function parseSeoMetaValue(value: unknown): SeoMetaValue {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    const record = value as Record<string, unknown>;
    const parsed: SeoMetaValue = {};
    if (typeof record.title === 'string') parsed.title = record.title;
    if (typeof record.description === 'string') parsed.description = record.description;
    return parsed;
}

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
