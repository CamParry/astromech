/**
 * Permission catalogue — every grantable permission a resolved config
 * produces, in one flat list. Four sources: `core`, `entry` and `global` (what
 * each declared resource's methods demand) and `plugin` (its declaration).
 */

import type { PermissionDeclarations } from '@/permissions/define';
import type { EntryAction } from '@/permissions/entry-permission';
import type { GlobalAction } from '@/permissions/global-permission';
import type { PluginDefinition, ResolvedConfig } from '@/types/index';
import { entryMethodPermissions } from '@/entries/catalogue';
import { globalMethodPermissions } from '@/globals/catalogue';
import { CORE_PERMISSIONS } from '@/permissions/core-permissions';
import { ENTRY_ACTIONS, entryPermission } from '@/permissions/entry-permission';
import { GLOBAL_ACTIONS, globalPermission } from '@/permissions/global-permission';
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

/** e.g. action='update', type='posts' → 'Update "posts" entries'. */
function entryPermissionLabel(action: EntryAction, type: string): string {
    const verb = action.charAt(0).toUpperCase() + action.slice(1);
    return `${verb} "${type}" entries`;
}

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

function buildEntryPermissions(config: ResolvedConfig): PermissionCatalogueEntry[] {
    return Object.values(config.entryTypes).flatMap((entryType) => {
        const demanded = new Set<string>(entryMethodPermissions(entryType));
        return ENTRY_ACTIONS.filter((action) =>
            demanded.has(entryPermission(entryType.id, action))
        ).map((action) => ({
            permission: entryPermission(entryType.id, action),
            label: entryPermissionLabel(action, entryType.id),
            source: 'entry' as const,
            owner: entryType.id,
        }));
    });
}

function buildGlobalPermissions(config: ResolvedConfig): PermissionCatalogueEntry[] {
    return Object.values(config.globals).flatMap((global) => {
        const demanded = new Set<string>(globalMethodPermissions(global));
        return GLOBAL_ACTIONS.filter((action) =>
            demanded.has(globalPermission(global.id, action))
        ).map((action) => ({
            permission: globalPermission(global.id, action),
            label: globalPermissionLabel(action, global.id),
            source: 'global' as const,
            owner: global.id,
        }));
    });
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
        ...buildEntryPermissions(config),
        ...buildGlobalPermissions(config),
        ...buildPluginPermissions(plugins),
    ];

    catalogue.sort((a, b) => {
        const sourceCmp = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
        if (sourceCmp !== 0) return sourceCmp;
        return a.permission.localeCompare(b.permission);
    });

    return catalogue;
}
