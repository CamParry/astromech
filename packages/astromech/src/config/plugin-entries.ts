/**
 * Plugin identity validation, and the namespaced entry-type map plugins
 * contribute. Plugin types are not flat-merged into root `entries` — they live
 * under their plugin name.
 */

import type { ResolvedEntryType } from '@/types/index';
import type { PluginDefinition } from '@/types/plugins';
import { toResolvedEntryType } from '@/config/entry-types';
import { ALL_CAPABILITIES } from '@/entries/capabilities';
import { assertNoFieldTypeCollisions } from '@/plugins/runtime/plugin-fields';
import {
    assertNoPluginCollisions,
    checkPluginDependencies,
    pluginEntryTypes,
    resolvePluginIdentity,
} from '@/plugins/runtime/plugin-identity';
import { assertPluginTablePrefixes } from '@/plugins/runtime/plugin-tables';

/**
 * Access-key collisions, dependencies (existence + basic semver range), table
 * prefixes and field-type collisions. All crash loud.
 */
export function assertPluginsValid(plugins: PluginDefinition[]): void {
    assertNoPluginCollisions(plugins);
    checkPluginDependencies(plugins);
    assertPluginTablePrefixes(plugins);
    assertNoFieldTypeCollisions(plugins);
}

/**
 * Resolve every plugin's entry types into the namespaced map. The live
 * `repository` instance is stripped here and registered into the entry
 * repository registry at boot (`registerPlugins`).
 */
export function resolvePluginEntries(
    plugins: PluginDefinition[]
): Record<string, Record<string, ResolvedEntryType>> {
    const pluginEntries: Record<string, Record<string, ResolvedEntryType>> = {};

    for (const plugin of plugins) {
        if (!plugin.entries) continue;
        const name = resolvePluginIdentity(plugin).namespace;
        const types: Record<string, ResolvedEntryType> = {};
        for (const [type, entryType] of pluginEntryTypes(plugin)) {
            types[type] = toResolvedEntryType(
                `${name}/${type}`,
                entryType,
                entryType.repository?.supports ?? ALL_CAPABILITIES
            );
        }
        pluginEntries[name] = types;
    }

    return pluginEntries;
}
