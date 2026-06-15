/**
 * Character-count analysis for text inputs — pure and browser/server safe.
 *
 * Powers the advisory counter on `text`/`textarea` fields (`field.count`) and
 * is reused by plugins that audit content length (e.g. the SEO plugin's
 * title/description checks). An advisory range is soft: exceeding `max` is
 * allowed, it just reports `long`.
 */

/** Soft recommended length range. Either bound may be omitted. */
export type CountRange = { min?: number; max?: number };

export type CountStatus = 'empty' | 'short' | 'good' | 'long';

export function lengthStatus(length: number, range: CountRange): CountStatus {
    if (length === 0) return 'empty';
    if (range.min !== undefined && length < range.min) return 'short';
    if (range.max !== undefined && length > range.max) return 'long';
    return 'good';
}
