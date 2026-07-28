/**
 * The package name, as a literal.
 *
 * Identity is declared in `index.ts` alongside the rest of the definition;
 * this const exists only because `definePluginTable` needs the package as a
 * *type* to derive `plugin_redirects_*` table names for `PluginDB`, and a
 * value inside the definition can't reach a module-scope descriptor. It is the
 * one thing in this package that names its identity outside `index.ts` — keep
 * it that way.
 */
export const REDIRECTS_PACKAGE = '@astromech/redirects';

export const REDIRECT_TYPE = 'redirect';

export type RedirectsOptions = {
    /** Auto-create a redirect when an entry's resolved URL changes. Default: true. */
    generateOnSlugChange?: boolean;
};

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
