/**
 * Admin edit path for an entry, from its wire type id. A plugin entry type
 * lives at `/plugin/<ns>/entries/<bare-type>/<id>`; the root route redirects
 * there, but links are built in the canonical plugin shape. An entry has one
 * id across its locales, so the locale (and the staged row, when one is being
 * edited) rides in the search params.
 */

import { parseEntryTypeId } from '@/entries/entry-types.shared';

/** Which row of an entry an edit link addresses. */
export type EntryEditSearch = {
    locale?: string | undefined;
    /** Edit the staged change for that locale rather than the canonical row. */
    staged?: boolean | undefined;
};

/** The search string for an edit link; empty when nothing narrows it. */
function editSearchString(search: EntryEditSearch | undefined): string {
    const params = new URLSearchParams();
    if (search?.locale !== undefined) params.set('locale', search.locale);
    if (search?.staged === true) params.set('staged', 'true');
    const query = params.toString();
    return query === '' ? '' : `?${query}`;
}

export function entryAdminPath(
    typeId: string,
    id: string,
    search?: EntryEditSearch
): string {
    const parsed = parseEntryTypeId(typeId);
    const path =
        parsed === null
            ? `/entries/${typeId}/${id}`
            : `/plugin/${parsed.plugin}/entries/${parsed.type}/${id}`;
    return `${path}${editSearchString(search)}`;
}

/**
 * Edit path under a mount's own base path, for the callers that already hold
 * one (`/entries/post`, `/plugin/forms/entries/form`).
 */
export function entryEditPath(
    basePath: string,
    id: string,
    search?: EntryEditSearch
): string {
    return `${basePath}/${id}${editSearchString(search)}`;
}

/** Version-history path for one locale of an entry, under a mount's base path. */
export function entryVersionsPath(basePath: string, id: string, locale?: string): string {
    return `${basePath}/${id}/versions${editSearchString({ locale })}`;
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

/** Parse/validate raw URL search into the typed entry-edit search shape. */
export function validateEntryEditSearch(
    search: Record<string, unknown>
): EntryEditSearch {
    const out: EntryEditSearch = {};
    if (typeof search['locale'] === 'string' && search['locale']) {
        out.locale = search['locale'];
    }
    if (search['staged'] === true || search['staged'] === 'true') out.staged = true;
    return out;
}
