/**
 * Plugin Drizzle schema collection + convention enforcement.
 *
 * Plugins may ship Drizzle tables (an escape valve for data that doesn't fit
 * entries). Tables must be prefixed `plugin_{alias}_` to namespace them and
 * prevent collisions; there are no cross-plugin foreign keys (soft string refs
 * only). This module collects plugin table objects and enforces the prefix at
 * config-resolution time (crash loud).
 *
 * The `db:generate` CLI command (`astromech db:generate`, implemented in
 * `src/cli/commands/db-generate.ts`) reads each plugin's `schemaModule`
 * specifier, generates a combined `.astromech/drizzle.schema.ts`, and spawns
 * drizzle-kit to produce the app's migration log. See ROADMAP Phase 18a.
 */

import { getTableName, is, Table } from 'drizzle-orm';
import type { PluginDefinition } from '@/types/index.js';
import { pluginTablePrefix, resolvePluginIdentity } from '@/plugins/runtime/plugin-identity.js';

export type CollectedPluginTable = {
    alias: string;
    tableName: string;
    table: Table;
};

/** Flatten every Drizzle table declared across the plugin set. */
export function collectPluginSchemas(defs: PluginDefinition[]): CollectedPluginTable[] {
    const collected: CollectedPluginTable[] = [];
    for (const def of defs) {
        if (!def.schema) continue;
        const { alias } = resolvePluginIdentity(def);
        for (const table of def.schema) {
            if (!is(table, Table)) continue;
            collected.push({ alias, tableName: getTableName(table), table });
        }
    }
    return collected;
}

/**
 * Enforce the `plugin_{alias}_` table-name prefix on every plugin-shipped
 * table. Throws a build error on the first violation.
 */
export function assertPluginTablePrefixes(defs: PluginDefinition[]): void {
    for (const { alias, tableName } of collectPluginSchemas(defs)) {
        const prefix = pluginTablePrefix(alias);
        if (!tableName.startsWith(prefix)) {
            throw new Error(
                `Astromech plugin table "${tableName}" must be prefixed "${prefix}". ` +
                    `Plugin tables are namespaced by alias to prevent collisions.`
            );
        }
    }
}
