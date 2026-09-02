/**
 * Admin paths for a global, from its wire key. A host global lives at
 * `/globals/<key>`; a plugin's is qualified `<namespace>/<key>` and lives at
 * `/plugin/<namespace>/globals/<key>`, so the root route redirects a qualified
 * key there. A global is addressed by key alone, so the locale (and the staged
 * row, when one is being edited) rides in the search params.
 */

import type { EntryEditSearch } from '@/admin/utilities/entry-admin-path';
import { editSearchString } from '@/admin/utilities/entry-admin-path';
// A qualified global key splits on the same separator a qualified entry type
// does; the rule has one implementation.
import { parseEntryTypeId } from '@/entries/entry-types.shared';

/** Edit path under a mount's own base path (`/globals/site`). */
export function globalEditPath(basePath: string, search?: EntryEditSearch): string {
    return `${basePath}${editSearchString(search)}`;
}

/** Version-history path for one locale of a global, under its base path. */
export function globalVersionsPath(basePath: string, locale?: string): string {
    return `${basePath}/versions${editSearchString({ locale })}`;
}

/**
 * Route params for the plugin globals route when the root `/globals/$key`
 * route is given a qualified key, or `null` for a bare one. The root routes
 * redirect on a non-null result instead of rendering a half-working page.
 */
export function pluginGlobalRouteParams(
    keyParam: string
): { name: string; key: string } | null {
    const parsed = parseEntryTypeId(keyParam);
    if (parsed === null) return null;
    return { name: parsed.plugin, key: parsed.type };
}
