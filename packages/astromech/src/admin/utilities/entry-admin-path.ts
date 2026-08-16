/**
 * Admin edit path for an entry, from its wire type id.
 *
 * A plugin entry type lives at `/plugin/<ns>/entries/<bare-type>/<id>`. The root
 * `/entries/<qualified>/<id>` route redirects there, so both forms resolve, but
 * links are built in the canonical plugin shape.
 */

import { parseEntryTypeId } from '@/utilities/entry-type-ids';

export function entryAdminPath(typeId: string, id: string): string {
    const parsed = parseEntryTypeId(typeId);
    if (parsed === null) return `/entries/${typeId}/${id}`;
    return `/plugin/${parsed.plugin}/entries/${parsed.type}/${id}`;
}

/**
 * Route params for the plugin entries route when the root `/entries/$type`
 * route is given a qualified type id, or `null` for a bare one. The root routes
 * redirect on a non-null result instead of rendering a half-working page.
 */
export function pluginEntryRouteParams(
    typeParam: string
): { name: string; type: string } | null {
    const parsed = parseEntryTypeId(typeParam);
    if (parsed === null) return null;
    return { name: parsed.plugin, type: parsed.type };
}
