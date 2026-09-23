/**
 * Derives a plugin's admin-shell metadata from `admin.pages`: the sidebar
 * tree grouped under the plugin's label/icon, and the flattened page list,
 * with permission strings resolved so the browser never needs the namespacing rule.
 */

import type {
    AdminPage,
    PluginDefinition,
    PluginNavItem,
    ResolvedAdminPage,
    ResolvedConfig,
    ResolvedPluginIdentity,
} from '@/types/index';
import { entryPermission } from '@/permissions/entry-permission';
import { globalPermission } from '@/permissions/global-permission';
import { resolvePluginPermission, titleCaseNamespace } from './plugin-identity';

/**
 * Admin display name: plugin `label` if set, otherwise the namespace
 * title-cased (`redirects` → `Redirects`) so a label-less plugin never
 * renders a bare lowercase namespace in the sidebar.
 */
export function resolvePluginLabel(
    def: PluginDefinition,
    identity: ResolvedPluginIdentity
): string {
    return def.label ?? titleCaseNamespace(identity.namespace);
}

function resolvePagePermission(namespace: string, page: AdminPage): string | null {
    if (page.permission === undefined) return null;
    return resolvePluginPermission(namespace, page.permission);
}

/** Flatten a plugin's pages into unified ResolvedAdminPage[]. */
export function derivePluginPages(
    identity: ResolvedPluginIdentity,
    def: PluginDefinition
): ResolvedAdminPage[] {
    return (def.admin?.pages ?? []).map((page) => {
        const key = `${identity.namespace}${page.path}`;

        return {
            key,
            path: page.path,
            label: page.label,
            ...(page.icon !== undefined ? { icon: page.icon } : {}),
            componentKey: key,
            permission: resolvePagePermission(identity.permissionNamespace, page),
            nav: page.nav !== false,
        };
    });
}

/**
 * Sidebar tree for one plugin: its entry types and globals from the resolved
 * config, then its pages, as children of a single group carrying the plugin's
 * `label`/`icon`. The sidebar auto-flattens single-child groups.
 */
export function derivePluginNav(
    identity: ResolvedPluginIdentity,
    def: PluginDefinition,
    config: Pick<ResolvedConfig, 'entryTypes' | 'globals'>
): PluginNavItem[] {
    const owned = <T extends { id: string; plugin?: string }>(map: Record<string, T>) =>
        Object.values(map).filter((value) => value.plugin === identity.namespace);
    const name = (id: string): string => id.slice(identity.namespace.length + 1);

    // Each gates on the read permission its routes check.
    const entryChildren: PluginNavItem[] = owned(config.entryTypes).map((entryType) => ({
        label: entryType.plural,
        to: `/plugin/${identity.namespace}/entries/${name(entryType.id)}`,
        permission: entryPermission(entryType.id, 'read'),
    }));

    const globalChildren: PluginNavItem[] = owned(config.globals)
        .filter((global) => global.nav !== false)
        .map((global) => {
            const item: PluginNavItem = {
                label: typeof global.label === 'string' ? global.label : global.label.$t,
                to: `/plugin/${identity.namespace}/globals/${name(global.id)}`,
                permission: globalPermission(global.id, 'read'),
            };
            if (global.icon !== undefined) item.icon = global.icon;
            return item;
        });

    const pageChildren = (def.admin?.pages ?? [])
        .filter((page) => page.nav !== false)
        .map((page) => {
            // page.label is Label (string | i18n descriptor); resolve to string
            // for the nav item. i18n descriptors fall back to the $t key here
            // until the browser resolves them via resolveLabel.
            const labelStr: string =
                typeof page.label === 'string' ? page.label : page.label.$t;

            const item: PluginNavItem = {
                label: labelStr,
                to: `/plugin/${identity.namespace}${page.path}`,
            };
            if (page.icon !== undefined) item.icon = page.icon;
            const permission = resolvePagePermission(identity.permissionNamespace, page);
            if (permission !== null) item.permission = permission;
            return item;
        });

    const children = [...entryChildren, ...globalChildren, ...pageChildren];
    if (children.length === 0) return [];

    const group: PluginNavItem = {
        label: resolvePluginLabel(def, identity),
        children,
    };
    if (def.icon !== undefined) group.icon = def.icon;
    return [group];
}
