/**
 * Character-count analysis for text inputs — pure and browser/server safe.
 * Powers the advisory counter on `text`/`textarea` fields (`field.count`).
 * Soft: exceeding `max` is allowed, it just reports `long`.
 */

/** Soft recommended length range. Either bound may be omitted. */
export type CountRange = { min?: number; max?: number };

export type CountStatus = 'empty' | 'short' | 'good' | 'long';

/** Where `length` sits against an advisory range. */
export function countStatus(length: number, range: CountRange): CountStatus {
    if (length === 0) return 'empty';
    if (range.min !== undefined && length < range.min) return 'short';
    if (range.max !== undefined && length > range.max) return 'long';
    return 'good';
}
