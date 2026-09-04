/**
 * Global admin binding: the parameter object that lets the shared global page
 * components serve both host and plugin-namespaced globals without
 * behavioural divergence. The entries counterpart is
 * `admin/components/entries/binding.ts`.
 */

import type { AdminConfig, AdminGlobal, GlobalsService } from '@/types/index';
import { qualifyEntryType } from '@/entries/entry-types.shared';

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
 * Build the binding for a plugin-namespaced global, or `null` when the plugin or
 * key is unknown. `key` is the bare key from the route; the binding carries the
 * qualified key the globals service uses.
 */
export function buildPluginGlobalsBinding(
    plugins: AdminConfig['plugins'],
    name: string,
    key: string,
    api: GlobalsService
): GlobalsBinding | null {
    const plugin = plugins.find((p) => p.namespace === name);
    if (!plugin) return null;
    const config = plugin.globals[key];
    if (!config) return null;
    const ns = plugin.permissionNamespace;
    return {
        api,
        key: qualifyEntryType(name, key),
        cacheScope: name,
        config,
        basePath: `/plugin/${name}/globals/${key}`,
        permissionFor: (action) => `plugin:${ns}:global:${key}:${action}`,
    };
}
