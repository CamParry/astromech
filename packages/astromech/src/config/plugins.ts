/** Config-time validation of the plugin list, before anything it declares resolves. */

import type { PluginDefinition } from '@/types/plugins';
import { assertNoFieldTypeCollisions } from '@/plugins/runtime/plugin-fields';
import {
    assertNoPluginCollisions,
    checkPluginDependencies,
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
