/**
 * The namespaced globals map plugins contribute. A plugin's globals are not
 * flat-merged into the host's — they live under the plugin's namespace and are
 * addressed as `<namespace>/<key>`.
 */

import type { ResolvedGlobal } from '@/types/index';
import type { PluginDefinition } from '@/types/plugins';
import { assertUniqueGlobalKeys, toResolvedGlobal } from '@/config/globals';
import { QUALIFIED_SEPARATOR } from '@/entries/entry-types.shared';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';

/** Resolve every plugin's globals into the namespaced map. */
export function resolvePluginGlobals(
    plugins: PluginDefinition[]
): Record<string, Record<string, ResolvedGlobal>> {
    const pluginGlobals: Record<string, Record<string, ResolvedGlobal>> = {};

    for (const plugin of plugins) {
        if (!plugin.globals) continue;
        const namespace = resolvePluginIdentity(plugin).namespace;
        assertUniqueGlobalKeys(`plugin "${plugin.package}"`, plugin.globals);

        const globals: Record<string, ResolvedGlobal> = {};
        for (const global of plugin.globals) {
            globals[global.key] = toResolvedGlobal(
                `${namespace}${QUALIFIED_SEPARATOR}${global.key}`,
                global
            );
        }
        pluginGlobals[namespace] = globals;
    }

    return pluginGlobals;
}
