/**
 * Reading stored `seo` field values — pure, browser-safe. Persisted shapes are
 * never trusted, so the parse is tolerant and always returns a known shape.
 */

export type SeoMetaValue = {
    title?: string;
    description?: string;
};

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
