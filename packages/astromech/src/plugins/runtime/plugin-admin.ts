/**
 * Derives a plugin's admin-shell metadata from `admin.pages`: the sidebar
 * tree grouped under the plugin's label/icon, and the flattened page list,
 * with permission strings resolved so the browser never needs the namespacing rule.
 */

import type { EntryFields, ResolvedEntryFields } from '@/types/fields';
import type {
    AdminPage,
    PluginDefinition,
    PluginNavItem,
    ResolvedAdminPage,
    ResolvedPluginIdentity,
} from '@/types/index';
import {
    pluginEntryTypes,
    resolvePluginPermission,
    titleCaseNamespace,
} from './plugin-identity';

// Mirrors config-resolver's toResolvedFields.
function toResolvedFields(fields: EntryFields | undefined): ResolvedEntryFields {
    if (fields === undefined) return { main: [], sidebar: [] };
    if (Array.isArray(fields)) return { main: fields, sidebar: [] };
    return { main: fields.main, sidebar: fields.sidebar ?? [] };
}

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
    if (page.permission !== undefined) {
        return resolvePluginPermission(namespace, page.permission);
    }
    // Settings pages read/write the core settings table, whose API enforces
    // the core settings permissions — keep the page guard aligned.
    if (page.fields !== undefined) return 'settings:read';
    return null;
}

/** Validate and flatten a plugin's pages into unified ResolvedAdminPage[]. */
export function derivePluginPages(
    identity: ResolvedPluginIdentity,
    def: PluginDefinition
): ResolvedAdminPage[] {
    return (def.admin?.pages ?? []).map((page) => {
        if (page.component === undefined && page.fields === undefined) {
            throw new Error(
                `Astromech plugin "${identity.package}" page "${page.path}" needs ` +
                    `exactly one of \`component\` or \`fields\`.`
            );
        }
        if (page.component !== undefined && page.fields !== undefined) {
            throw new Error(
                `Astromech plugin "${identity.package}" page "${page.path}" must have ` +
                    `exactly one of \`component\` or \`fields\`, not both.`
            );
        }

        const baseKey = `plugin:${identity.permissionNamespace}:${page.path}`;
        const key = `${identity.namespace}${page.path}`;

        return {
            key,
            path: page.path,
            label: page.label,
            ...(page.icon !== undefined ? { icon: page.icon } : {}),
            baseKey,
            fields: page.fields !== undefined ? toResolvedFields(page.fields) : null,
            componentKey: page.component !== undefined ? key : null,
            translatable: page.translatable ?? false,
            permission: resolvePagePermission(identity.permissionNamespace, page),
            nav: page.nav !== false,
            public: page.public ?? false,
        };
    });
}

/**
 * Sidebar tree for one plugin: pages become children of a single group
 * carrying the plugin's `label`/`icon` (no separate nav declaration). The
 * sidebar auto-flattens single-child groups.
 */
export function derivePluginNav(
    identity: ResolvedPluginIdentity,
    def: PluginDefinition
): PluginNavItem[] {
    // Entry types contributed by the plugin become nav children, listed before
    // the plugin's pages. Each links to its namespaced list route and gates on
    // the type's read permission (`plugin:{ns}:entry:{type}:read`).
    const entryChildren: PluginNavItem[] = pluginEntryTypes(def).map(
        ([type, entryType]) => {
            // Matches the mounted entries API guard exactly:
            // `plugin:{permissionNamespace}:entry:{type}:{action}`. Built directly,
            // not via resolvePluginPermission, which would pass this `:`-string through.
            const item: PluginNavItem = {
                label: entryType.plural,
                to: `/plugin/${identity.namespace}/entries/${type}`,
                permission: `plugin:${identity.permissionNamespace}:entry:${type}:read`,
            };
            return item;
        }
    );

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

    const children = [...entryChildren, ...pageChildren];
    if (children.length === 0) return [];

    const group: PluginNavItem = {
        label: resolvePluginLabel(def, identity),
        children,
    };
    if (def.icon !== undefined) group.icon = def.icon;
    return [group];
}
