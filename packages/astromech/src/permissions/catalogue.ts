/**
 * Permission catalogue — every grantable permission a resolved config produces,
 * in one flat list. Pure function: no DB, no I/O, no boot.
 *
 * Three sources, mirroring where a permission comes from: `core` (the fixed set
 * core enforces), `entry` (derived per registered entry type — nothing declares
 * these), and `plugin` (each plugin's `permissions` declaration, namespaced).
 *
 * Consumed by `astromech permissions`; the shape it iterates is deliberately
 * the same as `codegen/method-manifest.ts`, so the two never disagree about
 * which types and plugins exist.
 */

import type { PluginDefinition, ResolvedConfig } from '@/types/index';
import type { PermissionDeclarations } from '@/permissions/define';
import { CORE_PERMISSIONS } from '@/permissions/index';
import {
    type EntryAction,
    pluginEntryPermission,
    rootEntryPermission,
} from '@/permissions/entry-permission';
import {
    resolvePluginIdentity,
    resolvePluginPermission,
} from '@/plugins/runtime/plugin-identity';

export type PermissionCatalogueEntry = {
    /** Fully-qualified, grantable permission string. */
    permission: string;
    label: string;
    description?: string;
    source: 'core' | 'entry' | 'plugin';
    /** Entry type id for `entry`, plugin namespace for `plugin`. Absent for core. */
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

const SOURCE_ORDER: Record<PermissionCatalogueEntry['source'], number> = {
    core: 0,
    entry: 1,
    plugin: 2,
};

// ============================================================================
// Groups
// ============================================================================

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

    // Plugin namespace → permissionNamespace, for plugin-mounted entry types.
    const pluginNsMap = new Map<string, string>();
    for (const def of plugins) {
        const identity = resolvePluginIdentity(def);
        pluginNsMap.set(identity.namespace, identity.permissionNamespace);
    }

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

// ============================================================================
// Public API
// ============================================================================

/** Every grantable permission in the resolved config, deterministically ordered. */
export function buildPermissionCatalogue(
    config: ResolvedConfig,
    plugins: PluginDefinition[] = []
): PermissionCatalogueEntry[] {
    const catalogue = [
        ...buildCorePermissions(),
        ...buildEntryPermissions(config, plugins),
        ...buildPluginPermissions(plugins),
    ];

    catalogue.sort((a, b) => {
        const sourceCmp = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
        if (sourceCmp !== 0) return sourceCmp;
        return a.permission.localeCompare(b.permission);
    });

    return catalogue;
}
