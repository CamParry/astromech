/**
 * Permission catalogue — every grantable permission a resolved config
 * produces, in one flat list. Pure function; four sources: `core`, `entry` and
 * `global` (derived per declared resource) and `plugin` (its declaration).
 */

import type { PermissionDeclarations } from '@/permissions/define';
import type { EntryAction } from '@/permissions/entry-permission';
import type { GlobalAction } from '@/permissions/global-permission';
import type { PluginDefinition, ResolvedConfig } from '@/types/index';
import { CORE_PERMISSIONS } from '@/permissions/core-permissions';
import {
    pluginEntryPermission,
    rootEntryPermission,
} from '@/permissions/entry-permission';
import {
    pluginGlobalPermission,
    rootGlobalPermission,
} from '@/permissions/global-permission';
import {
    resolvePluginIdentity,
    resolvePluginPermission,
} from '@/plugins/runtime/plugin-identity';

export type PermissionCatalogueEntry = {
    /** Fully-qualified, grantable permission string. */
    permission: string;
    label: string;
    description?: string;
    source: 'core' | 'entry' | 'global' | 'plugin';
    /** Resource id for `entry`/`global`, plugin namespace for `plugin`. Absent for core. */
    owner?: string;
};

/**
 * Entry actions, with the capability each one needs. `publish` only exists for
 * a versioned type — the same gate `buildEntriesMethods` applies, so the
 * catalogue never offers a grant for something the type cannot do.
 */
const ENTRY_ACTIONS: { action: EntryAction; requires?: 'versioning' }[] = [
    { action: 'read' },
    { action: 'create' },
    { action: 'update' },
    { action: 'delete' },
    { action: 'publish', requires: 'versioning' },
];

/** Whether an action's capability requirement is met for an entry type's caps. */
function actionCapabilityMet(
    requires: 'versioning' | undefined,
    capabilities: { versioning: boolean }
): boolean {
    if (requires === 'versioning') return capabilities.versioning;
    return true;
}

/** e.g. action='update', type='posts' → 'Update "posts" entries'. */
function entryPermissionLabel(action: EntryAction, type: string): string {
    const verb = action.charAt(0).toUpperCase() + action.slice(1);
    return `${verb} "${type}" entries`;
}

/** Global actions, with the capability each one needs — the entry gate again. */
const GLOBAL_ACTIONS: { action: GlobalAction; requires?: 'versioning' }[] = [
    { action: 'read' },
    { action: 'update' },
    { action: 'publish', requires: 'versioning' },
];

/** e.g. action='update', key='site' → 'Update "site" global'. */
function globalPermissionLabel(action: GlobalAction, key: string): string {
    const verb = action.charAt(0).toUpperCase() + action.slice(1);
    return `${verb} "${key}" global`;
}

const SOURCE_ORDER: Record<PermissionCatalogueEntry['source'], number> = {
    core: 0,
    entry: 1,
    global: 2,
    plugin: 3,
};

/** Plugin namespace → permissionNamespace, for plugin-mounted resources. */
function pluginNamespaceMap(plugins: PluginDefinition[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const def of plugins) {
        const identity = resolvePluginIdentity(def);
        map.set(identity.namespace, identity.permissionNamespace);
    }
    return map;
}

function buildCorePermissions(): PermissionCatalogueEntry[] {
    // Widened: `CORE_PERMISSIONS` infers literal declarations, so an entry
    // without a description has no `description` property to read.
    const declarations: PermissionDeclarations = CORE_PERMISSIONS;
    return Object.entries(declarations).map(([permission, declaration]) => {
        const entry: PermissionCatalogueEntry = {
            // Core keys are already absolute — there is no namespace to apply.
            permission,
            label: declaration.label,
            source: 'core',
        };
        if (declaration.description !== undefined) {
            entry.description = declaration.description;
        }
        return entry;
    });
}

function buildEntryPermissions(
    config: ResolvedConfig,
    plugins: PluginDefinition[]
): PermissionCatalogueEntry[] {
    const entries: PermissionCatalogueEntry[] = [];

    const pluginNsMap = pluginNamespaceMap(plugins);

    // Root entry types
    for (const [type, entryType] of Object.entries(config.entries)) {
        for (const { action, requires } of ENTRY_ACTIONS) {
            if (!actionCapabilityMet(requires, entryType.capabilities)) continue;
            entries.push({
                permission: rootEntryPermission(type, action),
                label: entryPermissionLabel(action, type),
                source: 'entry',
                owner: type,
            });
        }
    }

    // Plugin entry types
    for (const [pluginName, types] of Object.entries(config.pluginEntries)) {
        const permissionNamespace = pluginNsMap.get(pluginName) ?? pluginName;
        for (const [type, entryType] of Object.entries(types)) {
            for (const { action, requires } of ENTRY_ACTIONS) {
                if (!actionCapabilityMet(requires, entryType.capabilities)) continue;
                entries.push({
                    permission: pluginEntryPermission(permissionNamespace, type, action),
                    label: entryPermissionLabel(action, type),
                    source: 'entry',
                    owner: `${pluginName}/${type}`,
                });
            }
        }
    }

    return entries;
}

function buildGlobalPermissions(
    config: ResolvedConfig,
    plugins: PluginDefinition[]
): PermissionCatalogueEntry[] {
    const entries: PermissionCatalogueEntry[] = [];
    const pluginNsMap = pluginNamespaceMap(plugins);

    for (const [key, global] of Object.entries(config.globals)) {
        for (const { action, requires } of GLOBAL_ACTIONS) {
            if (!actionCapabilityMet(requires, global.capabilities)) continue;
            entries.push({
                permission: rootGlobalPermission(key, action),
                label: globalPermissionLabel(action, key),
                source: 'global',
                owner: key,
            });
        }
    }

    for (const [pluginName, globals] of Object.entries(config.pluginGlobals)) {
        const permissionNamespace = pluginNsMap.get(pluginName) ?? pluginName;
        for (const [key, global] of Object.entries(globals)) {
            for (const { action, requires } of GLOBAL_ACTIONS) {
                if (!actionCapabilityMet(requires, global.capabilities)) continue;
                entries.push({
                    permission: pluginGlobalPermission(permissionNamespace, key, action),
                    label: globalPermissionLabel(action, key),
                    source: 'global',
                    owner: `${pluginName}/${key}`,
                });
            }
        }
    }

    return entries;
}

function buildPluginPermissions(plugins: PluginDefinition[]): PermissionCatalogueEntry[] {
    const entries: PermissionCatalogueEntry[] = [];

    for (const def of plugins) {
        const identity = resolvePluginIdentity(def);
        for (const [key, declaration] of Object.entries(def.permissions ?? {})) {
            const entry: PermissionCatalogueEntry = {
                // Mirrors route enforcement: bare keys are plugin-scoped.
                permission: resolvePluginPermission(identity.permissionNamespace, key),
                label: declaration.label,
                source: 'plugin',
                owner: identity.namespace,
            };
            if (declaration.description !== undefined) {
                entry.description = declaration.description;
            }
            entries.push(entry);
        }
    }

    return entries;
}

/** Every grantable permission in the resolved config, deterministically ordered. */
export function buildPermissionCatalogue(
    config: ResolvedConfig,
    plugins: PluginDefinition[] = []
): PermissionCatalogueEntry[] {
    const catalogue = [
        ...buildCorePermissions(),
        ...buildEntryPermissions(config, plugins),
        ...buildGlobalPermissions(config, plugins),
        ...buildPluginPermissions(plugins),
    ];

    catalogue.sort((a, b) => {
        const sourceCmp = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
        if (sourceCmp !== 0) return sourceCmp;
        return a.permission.localeCompare(b.permission);
    });

    return catalogue;
}
