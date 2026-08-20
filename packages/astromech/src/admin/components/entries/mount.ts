/**
 * Entry admin mount: the parameter object that lets the shared entry page
 * components serve both root and plugin-namespaced entry types without
 * behavioural divergence.
 */

import type { AdminConfig, EntriesService } from '@/types/index';
import { qualifyEntryType } from '@/entries/type-ids.shared';

export type EntryAction = 'read' | 'create' | 'update' | 'delete' | 'publish';

export type EntriesMount = {
    /** Entries client bound to the mount's base path. */
    api: EntriesService;
    /** Wire type id: bare for a root type (`post`), qualified for a plugin type (`redirects/redirect`). */
    type: string;
    /** Cache scope: `''` (root) or the plugin name. Namespaces react-query keys. */
    cacheScope: string;
    /**
     * Single-type admin config (works for plugin types too). Possibly
     * undefined for an unknown root type — the page components guard with
     * optional access and bare-type fallbacks, matching the pre-extraction
     * behaviour.
     */
    config: AdminConfig['entries'][string] | undefined;
    /** Link base: `/entries/post` vs `/plugin/redirects/entries/redirect`. */
    basePath: string;
    /** Resolve a permission string for an action against this mount. */
    permissionFor: (action: EntryAction) => string;
};

/**
 * Build the mount for a plugin-namespaced entry type, or `null` when the
 * plugin or type is unknown. `type` is the bare id from the route; the mount
 * carries the qualified id the entries service uses internally.
 */
export function buildPluginEntriesMount(
    plugins: AdminConfig['plugins'],
    name: string,
    type: string,
    api: EntriesService
): EntriesMount | null {
    const plugin = plugins.find((p) => p.namespace === name);
    if (!plugin) return null;
    const config = plugin.entries[type];
    if (!config) return null;
    const ns = plugin.permissionNamespace;
    return {
        api,
        type: qualifyEntryType(name, type),
        cacheScope: name,
        config,
        basePath: `/plugin/${name}/entries/${type}`,
        permissionFor: (action) => `plugin:${ns}:entry:${type}:${action}`,
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
