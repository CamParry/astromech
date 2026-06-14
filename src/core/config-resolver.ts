/**
 * Configuration Resolution
 * Processes and resolves Astromech configuration with defaults
 */

import type {
    AstromechConfig,
    EntryTypeConfig,
    ResolvedConfig,
    ResolvedEntryTypeConfig,
} from '@/types/index.js';
import type {
    EntryFields,
    FieldDefinition,
    ResolvedEntryFields,
} from '@/types/fields.js';
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

/** Layout containers — flat data, pure chrome. Their children stay top-level. */
const LAYOUT_TYPES = new Set(['section', 'tabs', 'tab', 'accordion']);

/** Normalize the authored `fields` shape into the resolved two-column layout. */
function toResolvedFields(fields: EntryFields | undefined): ResolvedEntryFields {
    if (fields === undefined) return { main: [], sidebar: [] };
    if (Array.isArray(fields)) return { main: fields, sidebar: [] };
    return { main: fields.main, sidebar: fields.sidebar ?? [] };
}

/**
 * Structural-rule validation (spec §3.3), crash-loud naming the entry type:
 * `tab` is only valid as a direct child of `tabs`, and `tabs` may only contain
 * `tab` children.
 */
function validateFieldTree(
    typeKey: string,
    nodes: FieldDefinition[],
    insideTabs: boolean
): void {
    for (const node of nodes) {
        if (node.type === 'tab' && !insideTabs) {
            throw new Error(
                `Astromech entry type "${typeKey}": \`tab\` ("${node.name}") must be a ` +
                    `direct child of \`tabs\`.`
            );
        }
        if (node.type === 'tabs') {
            const children = node.fields ?? [];
            for (const child of children) {
                if (child.type !== 'tab') {
                    throw new Error(
                        `Astromech entry type "${typeKey}": \`tabs\` may only contain ` +
                            `\`tab\` children (got "${child.type}").`
                    );
                }
                validateFieldTree(typeKey, child.fields ?? [], false);
            }
            continue;
        }
        if (node.fields) validateFieldTree(typeKey, node.fields, false);
    }
}

/**
 * Collect names of fields flagged `searchable`. Recurses through layout
 * containers (their children are top-level data) but not data containers
 * (`group`/`repeater`/`blocks`), whose child names are not top-level keys.
 */
function collectSearchable(nodes: FieldDefinition[], out: string[]): void {
    for (const node of nodes) {
        if (LAYOUT_TYPES.has(node.type)) {
            collectSearchable(node.fields ?? [], out);
            continue;
        }
        if (node.searchable === true) out.push(node.name);
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

    const resolvedFields = toResolvedFields(cfg.fields);
    validateFieldTree(typeKey, resolvedFields.main, false);
    validateFieldTree(typeKey, resolvedFields.sidebar, false);

    // Derive search from searchable fields if not explicitly set.
    let resolvedSearch = cfg.search;
    if (resolvedSearch === undefined) {
        const searchableNames: string[] = [];
        collectSearchable(resolvedFields.main, searchableNames);
        collectSearchable(resolvedFields.sidebar, searchableNames);
        if (searchableNames.length > 0) resolvedSearch = searchableNames;
    }

    const { storage: _storage, fields: _fields, ...rest } = cfg;
    return {
        ...rest,
        fields: resolvedFields,
        ...(resolvedSearch !== undefined ? { search: resolvedSearch } : {}),
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
    const checkNodes = (ownerKey: string, nodes: FieldDefinition[]): void => {
        for (const field of nodes) {
            if (field.type === 'relationship') {
                const target = field.target;
                if (target && parseEntryTypeId(target)) {
                    if (resolveEntryType(config, target) === undefined) {
                        throw new Error(
                            `Astromech entry type "${ownerKey}": relationship field ` +
                                `"${field.name}" targets unknown entry type "${target}".`
                        );
                    }
                }
            }
            if (field.fields) checkNodes(ownerKey, field.fields);
        }
    };
    const check = (ownerKey: string, fields: ResolvedEntryFields): void => {
        checkNodes(ownerKey, fields.main);
        checkNodes(ownerKey, fields.sidebar);
    };

    for (const [typeKey, cfg] of Object.entries(config.entries)) {
        check(typeKey, cfg.fields);
    }
    for (const [plugin, types] of Object.entries(config.pluginEntries)) {
        for (const [type, cfg] of Object.entries(types)) {
            check(`${plugin}/${type}`, cfg.fields);
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

    // Step 2: Resolve root entry capabilities and titleField (crash-loud).
    const resolvedEntries: Record<string, ResolvedEntryTypeConfig> = {};
    for (const [typeKey, cfg] of Object.entries(config.entries)) {
        resolvedEntries[typeKey] = resolveEntryTypeConfig(
            typeKey,
            cfg,
            cfg.storage?.supports ?? BUILT_IN_SUPPORTS
        );
    }

    // Step 3: Resolve plugin entry types into the namespaced map. Plugin types
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

    // Step 4: Validate qualified relationship targets against the built maps.
    assertQualifiedRelationshipTargets({ entries: resolvedEntries, pluginEntries });

    // Step 5: Return resolved config with defaults
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
