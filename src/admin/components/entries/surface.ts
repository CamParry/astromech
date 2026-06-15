/**
 * Entry admin surface — the single parameter object that lets the shared entry
 * page components (`entries-list-page`, `entry-new-page`, `entry-edit-page`,
 * `entry-versions-page`) serve both root entry types and plugin-namespaced
 * entry types without behavioural divergence.
 *
 * Root routes build a surface bound to `Astromech.entries`, an empty cache
 * scope (keys byte-identical to today's), `/entries/{type}` link bases, and
 * `entry:{type}:{action}` permission strings. Plugin routes build a surface
 * bound to a `/plugins/{name}/entries`-rooted client, the plugin name as cache
 * scope, `/plugin/{name}/entries/{type}` link bases, and
 * `plugin:{namespace}:entry:{type}:{action}` permission strings.
 *
 * Phase 4 refits the page bodies onto the definition layer (derived
 * Table/Form definitions + cell/field registries); the page shells stay
 * hand-written and consume those definitions.
 */

import type { AdminConfig } from '@/types/index.js';
import type { EntriesApi } from '@/types/index.js';

export type EntryAction = 'read' | 'create' | 'update' | 'delete' | 'publish';

export type EntriesSurface = {
    /** Entries client bound to the surface's base path. */
    api: EntriesApi;
    /** Bare wire type (`post`, `redirect`). */
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
    /** Resolve a permission string for an action against this surface. */
    permissionFor: (action: EntryAction) => string;
};

/**
 * Build the surface for a plugin-namespaced entry type, or `null` when the
 * plugin or type is unknown (caller renders standard not-found UI). The
 * entries client must be bound to `/plugins/{name}/entries` by the caller.
 */
export function buildPluginEntriesSurface(
    plugins: AdminConfig['plugins'],
    name: string,
    type: string,
    api: EntriesApi
): EntriesSurface | null {
    const plugin = plugins.find((p) => p.name === name);
    if (!plugin) return null;
    const config = plugin.entries[type];
    if (!config) return null;
    const ns = plugin.permissionNamespace;
    return {
        api,
        type,
        cacheScope: name,
        config,
        basePath: `/plugin/${name}/entries/${type}`,
        permissionFor: (action) => `plugin:${ns}:entry:${type}:${action}`,
    };
}

// ============================================================================
// List search params (URL-synced)
// ============================================================================

/**
 * URL search-param shape for the entries list, shared by the root and plugin
 * list routes so both persist the same filter/sort/page state to the URL. The
 * shared `EntriesListPage` reads it via `useSearch({ strict: false })`, so the
 * validator must live on every route that renders the page.
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
