import type { redirectMatchSchema, redirectSchema } from './service/redirects';
import type { z } from 'astromech';

/**
 * The package name, as a literal. Exists only because `definePluginTable`
 * needs it as a *type* to derive `plugin_redirects_*` table names for
 * `PluginDB`, which a value inside `index.ts`'s definition can't reach.
 */
export const REDIRECTS_PACKAGE = '@astromech/redirects';

export type RedirectsOptions = {
    /** Auto-create a redirect when an entry's resolved URL changes. Default: true. */
    generateOnSlugChange?: boolean;
};

/** What `lookup` answers for a path with an enabled rule. */
export type RedirectMatch = z.output<typeof redirectMatchSchema>;

export type RedirectStatus = RedirectMatch['status'];

/** A stored rule, as the admin methods answer it. */
export type Redirect = z.output<typeof redirectSchema>;
