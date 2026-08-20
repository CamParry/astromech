/**
 * String utilities
 */

/**
 * Slugify a string into a URL-friendly hyphenated token: lowercase, strip
 * apostrophes, collapse every run of non-alphanumeric characters to a
 * single hyphen, trim edge hyphens. `seo.section` → `seo-section`.
 */
export function slugify(s: string): string {
    return s
        .toLowerCase()
        .trim()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Truncate a string to maxLength, appending suffix (default '…') if cut.
 */
export function truncate(str: string, maxLength: number, suffix = '…'): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Capitalise the first letter of a string.
 */
export function capitalize(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}
