/**
 * Plugin migration collection — the CMS-specific half of the plugin migration
 * story.
 *
 * The merge half (`mergeMigrationProviders`) is engine-generic and lives in
 * `@astromech/schema-engine`: it knows nothing about plugins beyond
 * `{ alias, provider }`. This is the half that has to read `PluginDefinition`s,
 * so it lives here.
 *
 * Kept deliberately dependency-light: `kernel/boot.ts` imports it, and boot must
 * stay service-free (no transitive `virtual:astromech/config`).
 */

import type { MigrationProvider } from 'kysely';
import type { PluginDefinition } from '@/types/index.js';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity.js';

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
