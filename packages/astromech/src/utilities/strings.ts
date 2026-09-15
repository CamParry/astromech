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
