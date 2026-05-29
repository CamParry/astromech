/**
 * Plugin Drizzle schema collection + convention enforcement.
 *
 * Plugins may ship Drizzle tables (an escape valve for data that doesn't fit
 * entries). Tables must be prefixed `plugin_{alias}_` to namespace them and
 * prevent collisions; there are no cross-plugin foreign keys (soft string refs
 * only). This module collects plugin table objects and enforces the prefix at
 * config-resolution time (crash loud).
 *
 * The `db:generate` / `db:migrate` CLI orchestration (feeding these schemas to
 * drizzle-kit for a single migration log) is deferred until the first
 * table-shipping plugin exists to validate against — see ROADMAP Phase 18a.
 */

import { getTableName, is, Table } from 'drizzle-orm';
import type { PluginDefinition } from '@/types/index.js';
import { resolvePluginIdentity } from '@/core/plugin-identity.js';

export type CollectedPluginTable = {
    alias: string;
    exportName: string;
    tableName: string;
    table: Table;
};

/** Flatten every Drizzle table declared across the plugin set. */
export function collectPluginSchemas(defs: PluginDefinition[]): CollectedPluginTable[] {
    const collected: CollectedPluginTable[] = [];
    for (const def of defs) {
        if (!def.schema) continue;
        const { alias } = resolvePluginIdentity(def);
        for (const [exportName, table] of Object.entries(def.schema)) {
            if (!is(table, Table)) continue;
            collected.push({ alias, exportName, tableName: getTableName(table), table });
        }
    }
    return collected;
}

/**
 * Enforce the `plugin_{alias}_` table-name prefix on every plugin-shipped
 * table. Throws a build error on the first violation.
 */
export function assertPluginTablePrefixes(defs: PluginDefinition[]): void {
    for (const { alias, tableName, exportName } of collectPluginSchemas(defs)) {
        const prefix = `plugin_${alias}_`;
        if (!tableName.startsWith(prefix)) {
            throw new Error(
                `Astromech plugin table "${tableName}" (export "${exportName}") must be prefixed ` +
                    `"${prefix}". Plugin tables are namespaced by alias to prevent collisions.`
            );
        }
    }
}
