/**
 * Types and constants shared across the plugin. Must stay dependency-free.
 */

export const REDIRECT_TYPE = 'redirect';

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
