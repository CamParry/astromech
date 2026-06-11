/**
 * Configuration Resolution
 * Processes and resolves Astromech configuration with defaults
 */

import type {
    AstromechConfig,
    EntryTypeConfig,
    FieldGroup,
    ResolvedConfig,
    ResolvedEntryTypeConfig,
} from '@/types/index.js';
import {
    assertNoPluginCollisions,
    checkPluginDependencies,
    resolvePluginIdentity,
} from '@/core/plugin-identity.js';
import { assertPluginTablePrefixes } from '@/core/plugin-schema.js';
import { assertNoFieldTypeCollisions } from '@/core/plugin-fields.js';
import {
    BUILT_IN_SUPPORTS,
    resolveEntryCapabilities,
    assertEntryTypeValid,
    type Capability,
} from '@/core/entry-storage/capabilities.js';
import { parseEntryTypeId, resolveEntryType } from '@/core/entry-types.js';

/**
 * Sort field groups by priority within each collection and resource
 *
 * Lower priority numbers appear first.
 *
 * @param config - Astromech configuration
 */
export function sortFieldGroups(config: AstromechConfig): void {
    const sortGroups = (groups: FieldGroup[]): void => {
        groups.sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10));
    };

    // Sort entry type field groups
    for (const entryType of Object.values(config.entries)) {
        sortGroups(entryType.fieldGroups);
    }

    // Sort plugin-contributed entry type field groups
    for (const plugin of config.plugins ?? []) {
        for (const entryType of Object.values(plugin.entries ?? {})) {
            sortGroups(entryType.fieldGroups);
        }
    }

    // Sort media field groups
    if (config.media?.fieldGroups) {
        sortGroups(config.media.fieldGroups);
    }

    // Sort users field groups
    if (config.users?.fieldGroups) {
        sortGroups(config.users.fieldGroups);
    }
}

/**
 * Resolve a single entry type: validate capabilities + titleField (crash-loud
 * on mismatch) and strip the live `storage` instance (it cannot be serialised
 * into the virtual config module). `typeKey` is used in error messages — the
 * qualified `{plugin}/{type}` key for plugin types.
 */
function resolveEntryTypeConfig(
    typeKey: string,
    cfg: EntryTypeConfig,
    storageSupports: readonly Capability[]
): ResolvedEntryTypeConfig {
    const capabilities = resolveEntryCapabilities(cfg, storageSupports);
    assertEntryTypeValid(typeKey, cfg, capabilities, storageSupports);
    const { storage: _storage, ...rest } = cfg;
    return {
        ...rest,
        capabilities,
        titleField: cfg.titleField ?? 'title',
    };
}

/**
 * Boot-time validation for qualified relationship targets. Any relationship
 * field whose `target` is qualified (`{plugin}/{type}`) must resolve against the
 * fully-built {entries, pluginEntries}. Bare targets keep existing behavior
 * (no new validation here). Crashes loud naming the entry type, field, target.
 */
function assertQualifiedRelationshipTargets(
    config: Pick<ResolvedConfig, 'entries' | 'pluginEntries'>
): void {
    const check = (ownerKey: string, groups: FieldGroup[]): void => {
        for (const group of groups) {
            for (const field of group.fields) {
                if (field.type !== 'relationship') continue;
                const target = field.target;
                if (!target || !parseEntryTypeId(target)) continue;
                if (resolveEntryType(config, target) === undefined) {
                    throw new Error(
                        `Astromech entry type "${ownerKey}": relationship field "${field.name}" ` +
                            `targets unknown entry type "${target}".`
                    );
                }
            }
        }
    };

    for (const [typeKey, cfg] of Object.entries(config.entries)) {
        check(typeKey, cfg.fieldGroups);
    }
    for (const [plugin, types] of Object.entries(config.pluginEntries)) {
        for (const [type, cfg] of Object.entries(types)) {
            check(`${plugin}/${type}`, cfg.fieldGroups);
        }
    }
}

/**
 * Resolve the config with defaults and plugin merging
 *
 * @param config - User-provided Astromech configuration
 * @returns Fully resolved configuration with defaults
 */
export function resolveConfig(config: AstromechConfig): ResolvedConfig {
    // Step 1: Validate plugin identities (access-key collisions) and
    // dependencies (existence + basic semver range). Both crash loud.
    const plugins = config.plugins ?? [];
    assertNoPluginCollisions(plugins);
    checkPluginDependencies(plugins);
    assertPluginTablePrefixes(plugins);
    assertNoFieldTypeCollisions(plugins);

    // Step 2: Sort field groups by priority (root + plugin entry types).
    sortFieldGroups(config);

    // Step 3: Resolve root entry capabilities and titleField (crash-loud).
    const resolvedEntries: Record<string, ResolvedEntryTypeConfig> = {};
    for (const [typeKey, cfg] of Object.entries(config.entries)) {
        resolvedEntries[typeKey] = resolveEntryTypeConfig(
            typeKey,
            cfg,
            cfg.storage?.supports ?? BUILT_IN_SUPPORTS
        );
    }

    // Step 4: Resolve plugin entry types into the namespaced map. Plugin types
    // are not flat-merged into root `entries` — they live under their plugin
    // name. The live `storage` instance is stripped here and registered into
    // the storage registry at boot (`registerPlugins`).
    const pluginEntries: Record<string, Record<string, ResolvedEntryTypeConfig>> = {};
    for (const plugin of plugins) {
        if (!plugin.entries) continue;
        const name = resolvePluginIdentity(plugin).name;
        const types: Record<string, ResolvedEntryTypeConfig> = {};
        for (const [type, cfg] of Object.entries(plugin.entries)) {
            types[type] = resolveEntryTypeConfig(
                `${name}/${type}`,
                cfg,
                cfg.storage?.supports ?? BUILT_IN_SUPPORTS
            );
        }
        pluginEntries[name] = types;
    }

    // Step 5: Validate qualified relationship targets against the built maps.
    assertQualifiedRelationshipTargets({ entries: resolvedEntries, pluginEntries });

    // Step 6: Return resolved config with defaults
    // Destructure out `db` and `plugins` so neither is included in the resolved
    // config: the driver instance and plugin definitions (which carry live
    // Drizzle table objects in `schema`) cannot be JSON.stringify'd into the
    // virtual config module — `ResolvedConfig` already omits both.
    const { db: _db, plugins: _plugins, ...rest } = config;
    return {
        ...rest,
        adminRoute: config.adminRoute ?? '/admin',
        apiRoute: config.apiRoute ?? '/api',
        entries: resolvedEntries,
        pluginEntries,
        trash: {
            enabled: config.trash?.enabled ?? true,
            retentionDays: config.trash?.retentionDays ?? 30,
        },
    };
}
