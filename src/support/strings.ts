/**
 * String utilities
 */

/**
 * Convert a title string into a URL-friendly slug.
 * Lowercase, spaces to hyphens, strip non-alphanumeric.
 */
export function titleToSlug(title: string): string {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
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
