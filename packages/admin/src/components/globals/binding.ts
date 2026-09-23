/**
 * Global admin binding: the parameter object that lets the shared global page
 * components serve both host and plugin-namespaced globals without
 * behavioural divergence. The entries counterpart is
 * `components/entries/binding.ts`.
 */

import type { AdminConfig, AdminGlobal, GlobalsService } from 'astromech';
import { globalPermission, qualifyEntryType } from 'astromech/shared';

export type GlobalAction = 'read' | 'update' | 'publish';

export type GlobalsBinding = {
    /** Globals client bound to the binding's base path. */
    api: GlobalsService;
    /** Wire key: bare for a host global (`site`), qualified for a plugin's (`seo/settings`). */
    key: string;
    /** Cache scope: `''` (host) or the plugin name. Namespaces react-query keys. */
    cacheScope: string;
    /**
     * Single-global admin config, undefined for a key the config does not
     * declare — the page components render a not-found view for that.
     */
    config: AdminGlobal | undefined;
    /** Link base: `/globals/site` vs `/plugin/seo/globals/settings`. */
    basePath: string;
    /** Resolve a permission string for an action against this binding. */
    permissionFor: (action: GlobalAction) => string;
};

/**
 * Build the binding for a plugin's global, or `null` when that plugin declares
 * no such global. `key` is the key from the route; the binding carries the id
 * the globals service is called with.
 */
export function buildPluginGlobalsBinding(
    config: Pick<AdminConfig, 'globals'>,
    name: string,
    key: string,
    api: GlobalsService
): GlobalsBinding | null {
    const globalId = qualifyEntryType(name, key);
    const global = Object.hasOwn(config.globals, globalId)
        ? config.globals[globalId]
        : undefined;
    if (global?.plugin !== name) return null;
    return {
        api,
        key: globalId,
        cacheScope: name,
        config: global,
        basePath: `/plugin/${name}/globals/${key}`,
        permissionFor: (action) => globalPermission(globalId, action),
    };
}
