/**
 * Plugin table collection + convention enforcement. Plugins may ship their
 * own tables (`definePluginTable`), prefixed `plugin_{namespace}_` to
 * prevent collisions; this module collects them and enforces the prefix.
 */

import type { Table } from '@/database/define-table';
import type { PluginDefinition } from '@/types/index';
import {
    pluginTablePrefix,
    resolvePluginIdentity,
} from '@/plugins/runtime/plugin-identity';

export type CollectedPluginTable = {
    namespace: string;
    tableName: string;
    table: Table;
};

/** Flatten every table declared across the plugin set. */
export function collectPluginTables(defs: PluginDefinition[]): CollectedPluginTable[] {
    const collected: CollectedPluginTable[] = [];
    for (const def of defs) {
        if (!def.tables) continue;
        const { namespace } = resolvePluginIdentity(def);
        for (const desc of def.tables) {
            if (!isTable(desc)) continue;
            collected.push({ namespace, tableName: desc.name, table: desc });
        }
    }
    return collected;
}

/**
 * Shape check for an entry in a plugin's `tables` array. `tables` is typed, but
 * a plugin is third-party JS — a stale build can still hand us a Drizzle table
 * or a plain object, and that must be skipped rather than crash a read.
 */
export function isTable(value: unknown): value is Table {
    return (
        typeof value === 'object' &&
        value !== null &&
        'name' in value &&
        'columns' in value
    );
}

/**
 * Enforce the `plugin_{namespace}_` table-name prefix on every plugin-shipped
 * table. Throws a build error on the first violation.
 */
export function assertPluginTablePrefixes(defs: PluginDefinition[]): void {
    for (const { namespace, tableName } of collectPluginTables(defs)) {
        const prefix = pluginTablePrefix(namespace);
        if (!tableName.startsWith(prefix)) {
            throw new Error(
                `Astromech plugin table "${tableName}" must be prefixed "${prefix}". ` +
                    `Plugin tables are namespaced by the plugin's namespace to prevent collisions.`
            );
        }
    }
}
