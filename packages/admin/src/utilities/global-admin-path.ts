/**
 * Admin paths for a global, from its id. A host global lives at
 * `/globals/<key>`; a plugin's lives at `/plugin/<namespace>/globals/<key>`, so
 * the root route redirects a plugin's id there. The locale (and the staged row,
 * when one is being edited) rides in the search params.
 */

import type { EntryEditSearch } from './entry-admin-path';
import adminConfig from 'virtual:astromech/admin-config';
import { editSearchString } from './entry-admin-path';

/** Edit path under a mount's own base path (`/globals/site`). */
export function globalEditPath(basePath: string, search?: EntryEditSearch): string {
    return `${basePath}${editSearchString(search)}`;
}

/** Version-history path for one locale of a global, under its base path. */
export function globalVersionsPath(basePath: string, locale?: string): string {
    return `${basePath}/versions${editSearchString({ locale })}`;
}

/**
 * Route params for the plugin globals route when the id names a plugin's
 * global, or `null` for the site's own or an unknown id. The root routes
 * redirect on a non-null result instead of rendering a half-working page.
 */
export function pluginGlobalRouteParams(
    globalId: string
): { name: string; key: string } | null {
    const plugin = Object.hasOwn(adminConfig.globals, globalId)
        ? adminConfig.globals[globalId]?.plugin
        : undefined;
    if (plugin === undefined) return null;
    return { name: plugin, key: globalId.slice(plugin.length + 1) };
}
