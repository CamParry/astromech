/**
 * Plugin table-descriptor collection + convention enforcement.
 *
 * Plugins may ship their own tables (an escape valve for data that doesn't fit
 * entries), declared as `defineTable` descriptors via `definePlugin`. Table
 * names must be prefixed `plugin_{alias}_` to namespace them and prevent
 * collisions; there are no cross-plugin foreign keys (soft string refs only).
 * This module collects the descriptors and enforces the prefix at
 * config-resolution time (crash loud).
 *
 * Plugins generate their own migrations with `astromech plugin:generate`, which
 * reads their descriptors directly; core `db:generate` covers core tables only.
 */

import type { TableDescriptor } from '@/database/define-table.js';
import type { PluginDefinition } from '@/types/index.js';
import {
    pluginTablePrefix,
    resolvePluginIdentity,
} from '@/plugins/runtime/plugin-identity.js';

export type CollectedPluginTable = {
    alias: string;
    tableName: string;
    table: TableDescriptor;
};

/** Flatten every table descriptor declared across the plugin set. */
export function collectPluginSchemas(defs: PluginDefinition[]): CollectedPluginTable[] {
    const collected: CollectedPluginTable[] = [];
    for (const def of defs) {
        if (!def.schema) continue;
        const { alias } = resolvePluginIdentity(def);
        for (const desc of def.schema) {
            if (!isTableDescriptor(desc)) continue;
            collected.push({ alias, tableName: desc.name, table: desc });
        }
    }
    return collected;
}

/**
 * Shape check for an entry in a plugin's `schema` array. `schema` is typed, but
 * a plugin is third-party JS — a stale build can still hand us a Drizzle table
 * or a plain object, and that must be skipped rather than crash a read.
 */
export function isTableDescriptor(value: unknown): value is TableDescriptor {
    return (
        typeof value === 'object' &&
        value !== null &&
        'name' in value &&
        'columns' in value
    );
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
