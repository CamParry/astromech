/**
 * Plugin migration collection — the CMS-specific half of the plugin
 * migration story; the engine-generic merge lives in `@astromech/schema-engine`.
 * Dependency-light: `boot/boot.ts` imports it and must stay service-free.
 */

import type { PluginDefinition } from '@/types/index';
import type { MigrationProvider } from 'kysely';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';

/**
 * The migration providers shipped by the configured plugins, paired with the
 * alias their migrations are namespaced under. Plugins without a `migrations`
 * provider are skipped. Order follows `config.plugins`.
 */
export function collectPluginMigrations(
    defs: PluginDefinition[]
): { alias: string; provider: MigrationProvider }[] {
    const collected: { alias: string; provider: MigrationProvider }[] = [];
    for (const def of defs) {
        if (!def.migrations) continue;
        collected.push({
            alias: resolvePluginIdentity(def).namespace,
            provider: def.migrations,
        });
    }
    return collected;
}
