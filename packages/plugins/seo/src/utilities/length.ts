/**
 * Title/description length analysis — pure, browser-safe (the field renderer
 * and overview dashboard both import it). No dependencies on core server code.
 */

export type LengthRange = {
    min: number;
    max: number;
};

export type LengthStatus = 'empty' | 'short' | 'good' | 'long';

/** Search engines typically truncate titles past ~60 characters. */
export const SEO_TITLE_RANGE: LengthRange = { min: 30, max: 60 };
/** Meta descriptions are typically truncated past ~160 characters. */
export const SEO_DESCRIPTION_RANGE: LengthRange = { min: 70, max: 160 };

export function lengthStatus(length: number, range: LengthRange): LengthStatus {
    if (length === 0) return 'empty';
    if (length < range.min) return 'short';
    if (length <= range.max) return 'good';
    return 'long';
}
