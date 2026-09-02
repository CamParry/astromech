/**
 * Global admin mount: the parameter object that lets the shared global page
 * components serve both host and plugin-namespaced globals without
 * behavioural divergence. The entries counterpart is
 * `admin/components/entries/mount.ts`.
 */

import type { AdminConfig, AdminGlobal, GlobalsService } from '@/types/index';
import { qualifyEntryType } from '@/entries/entry-types.shared';

export type GlobalAction = 'read' | 'update' | 'publish';

export type GlobalsMount = {
    /** Globals client bound to the mount's base path. */
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
    /** Resolve a permission string for an action against this mount. */
    permissionFor: (action: GlobalAction) => string;
};

/**
 * Build the mount for a plugin-namespaced global, or `null` when the plugin or
 * key is unknown. `key` is the bare key from the route; the mount carries the
 * qualified key the globals service uses.
 */
export function buildPluginGlobalsMount(
    plugins: AdminConfig['plugins'],
    name: string,
    key: string,
    api: GlobalsService
): GlobalsMount | null {
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
