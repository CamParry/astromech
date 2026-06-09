/**
 * Types and constants shared across the plugin. Must stay dependency-free.
 */

export const REDIRECT_TYPE = 'redirect';

export type RedirectsOptions = {
    /** Auto-create a redirect when an entry's slug changes. Default: true. */
    generateOnSlugChange?: boolean;
    /**
     * Map an entry to the public path it is served at. Return null to skip.
     * Default: `/${slug}` (ignores type).
     */
    pathForEntry?: (entry: { type: string; slug: string | null }) => string | null;
};

export function defaultPathForEntry(entry: { slug: string | null }): string | null {
    return entry.slug ? `/${entry.slug}` : null;
}

export type RedirectStatus = '301' | '302';

export type RedirectMatch = {
    to: string;
    status: RedirectStatus;
};

/** Tolerant shape of a stored redirect entry's fields. */
export type RedirectFields = {
    from?: unknown;
    to?: unknown;
    status?: unknown;
    enabled?: unknown;
};
