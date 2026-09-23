/**
 * Entry admin binding: the parameter object that lets the shared entry page
 * components serve both root and plugin-namespaced entry types without
 * behavioural divergence.
 */

import type { AdminConfig } from 'astromech';
import { entryPermission, qualifyEntryType } from 'astromech/shared';

export type EntryAction = 'read' | 'create' | 'update' | 'delete' | 'publish';

export type EntriesBinding = {
    /** Wire type id: bare for a root type (`post`), qualified for a plugin type (`redirects/redirect`). */
    type: string;
    /** Cache scope: `''` (root) or the plugin name. Namespaces react-query keys. */
    cacheScope: string;
    /**
     * Single-type admin config (works for plugin types too). Possibly
     * undefined for an unknown root type — the page components guard with
     * optional access and bare-type fallbacks.
     */
    config: AdminConfig['entryTypes'][string] | undefined;
    /** Link base: `/entries/post` vs `/plugin/redirects/entries/redirect`. */
    basePath: string;
    /** Resolve a permission string for an action against this binding. */
    permissionFor: (action: EntryAction) => string;
};

/**
 * Build the binding for a plugin's entry type, or `null` when that plugin
 * declares no such type. `type` is the name from the route; the binding
 * carries the type id the entries service is called with.
 */
export function buildPluginEntriesBinding(
    config: Pick<AdminConfig, 'entryTypes'>,
    name: string,
    type: string
): EntriesBinding | null {
    const typeId = qualifyEntryType(name, type);
    const entryType = Object.hasOwn(config.entryTypes, typeId)
        ? config.entryTypes[typeId]
        : undefined;
    if (entryType?.plugin !== name) return null;
    return {
        type: typeId,
        cacheScope: name,
        config: entryType,
        basePath: `/plugin/${name}/entries/${type}`,
        permissionFor: (action) => entryPermission(typeId, action),
    };
}

/**
 * URL search-param shape for the entries list, shared by the root and plugin
 * list routes so both persist the same filter/sort/page state. The shared
 * `EntriesListPage` reads it via `useSearch({ strict: false })`.
 */
export type EntriesListSearch = {
    q?: string;
    status?: string;
    locale?: string;
    /** `${columnKey}:${'asc' | 'desc'}` */
    sort?: string;
    page?: number;
};

/** Parse/validate raw URL search into the typed list-search shape. */
export function validateEntriesListSearch(
    search: Record<string, unknown>
): EntriesListSearch {
    const out: EntriesListSearch = {};
    if (typeof search['q'] === 'string' && search['q']) out.q = search['q'];
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
    if (typeof search['sort'] === 'string' && /^.+:(asc|desc)$/.test(search['sort'])) {
        out.sort = search['sort'];
    }
    const pageRaw = search['page'];
    const pageNum =
        typeof pageRaw === 'number'
            ? pageRaw
            : typeof pageRaw === 'string'
              ? Number(pageRaw)
              : NaN;
    if (Number.isFinite(pageNum) && pageNum > 1) out.page = pageNum;
    return out;
}
