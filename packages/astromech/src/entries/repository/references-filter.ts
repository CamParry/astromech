/**
 * The shape guard both entry repositories apply to `where: { references }`.
 * `entries.query` validates the filter and its schema path first and throws on
 * a malformed one, so the guard has nothing to report.
 */

import type { ReferencesFilter } from '@/types/index';

/** A `references` value carrying both strings; anything else filters nothing. */
export function isReferencesFilter(value: unknown): value is ReferencesFilter {
    if (typeof value !== 'object' || value === null) return false;
    const { path, id } = value as Partial<ReferencesFilter>;
    return typeof path === 'string' && path !== '' && typeof id === 'string' && id !== '';
}
