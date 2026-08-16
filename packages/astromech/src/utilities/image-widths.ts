/**
 * The responsive width allowlist for image variants, and its normalisation.
 */

/** Default responsive width allowlist for image variants. Extend via spread or replace wholesale. */
export const defaultImageWidths = [320, 640, 768, 1024, 1280, 1536, 1920];

/** Dedupe + ascending sort. */
export function normaliseWidths(widths: readonly number[]): number[] {
    return [...new Set(widths)].sort((a, b) => a - b);
}
