/**
 * Admin edit path for an entry, from its type id. A plugin's entry type lives
 * at `/plugin/<ns>/entries/<name>/<id>`; the root route redirects there, but
 * links are built in the canonical plugin shape. The locale (and the staged
 * row, when one is being edited) rides in the search params.
 */

import type { ListSearch } from '../components/ui/use-list-state';
import adminConfig from 'virtual:astromech/admin-config';
import { validateListSearch } from '../components/ui/use-list-state';

/** Which row of an entry an edit link addresses. */
export type EntryEditSearch = {
    locale?: string | undefined;
    /** Edit the staged change for that locale rather than the canonical row. */
    staged?: boolean | undefined;
};

/**
 * The search string for an edit link; empty when nothing narrows it. Shared
 * with `global-admin-path.ts`, whose links carry the same two params.
 */
export function editSearchString(search: EntryEditSearch | undefined): string {
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
    return entryEditPath(entryTypeBasePath(typeId), id, search);
}

/** An entry type's list path, which its other paths extend: `/entries/post`. */
export function entryTypeBasePath(typeId: string): string {
    const plugin = pluginEntryRouteParams(typeId);
    return plugin === null
        ? `/entries/${typeId}`
        : `/plugin/${plugin.name}/entries/${plugin.type}`;
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
 * Route params for the plugin entries route when the type id names a plugin's
 * entry type, or `null` for the site's own or an unknown id. The root routes
 * redirect on a non-null result instead of rendering a half-working page.
 */
export function pluginEntryRouteParams(
    typeId: string
): { name: string; type: string } | null {
    const plugin = Object.hasOwn(adminConfig.entryTypes, typeId)
        ? adminConfig.entryTypes[typeId]?.plugin
        : undefined;
    if (plugin === undefined) return null;
    return { name: plugin, type: typeId.slice(plugin.length + 1) };
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

/**
 * URL search-param shape for the entries list, shared by the site and plugin
 * list routes: the list's search, sort and page plus the status and locale filters.
 */
export type EntriesListSearch = ListSearch & {
    status?: string;
    locale?: string;
};

/** Parse/validate raw URL search into the typed list-search shape. */
export function validateEntriesListSearch(
    search: Record<string, unknown>
): EntriesListSearch {
    const out: EntriesListSearch = validateListSearch(search);
    if (
        typeof search['status'] === 'string' &&
        search['status'] &&
        search['status'] !== 'all'
    ) {
        out.status = search['status'];
    }
    if (typeof search['locale'] === 'string' && search['locale']) {
        out.locale = search['locale'];
    }
    return out;
}
