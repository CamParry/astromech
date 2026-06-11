/**
 * Derivation of a plugin's admin-shell metadata from `admin.pages` — pages
 * are the core concept (spec §3.5): each page is a `component` view or an
 * auto-rendered `settings` form, and appears in the sidebar unless it opts
 * out (`nav: false`). The sidebar tree (grouped under the plugin's
 * `label`/`icon`) and the serializable page list are both derived here, with
 * permission strings resolved (`resolvePluginPermission`) so the browser
 * never needs to know the namespacing rule.
 */

import type {
    PluginDefinition,
    PluginNavItem,
    PluginPage,
    PluginSettingsSchema,
    ResolvedPluginIdentity,
} from '@/types/index.js';
import { resolvePluginPermission } from './plugin-identity.js';

export type DerivedPluginPage = {
    /** Splat key, `{name}{path}` — matches the `/plugin/$` route. */
    key: string;
    label: string;
    permission: string | null;
    settings: PluginSettingsSchema | null;
    hasComponent: boolean;
};

/** Admin display name: plugin `label`, falling back to the access key. */
export function resolvePluginLabel(
    def: PluginDefinition,
    identity: ResolvedPluginIdentity
): string {
    return def.label ?? identity.name;
}

function resolvePagePermission(namespace: string, page: PluginPage): string | null {
    if (page.permission !== undefined) {
        return resolvePluginPermission(namespace, page.permission);
    }
    // Settings pages read/write the core settings table, whose API enforces
    // the core settings permissions — keep the page guard aligned.
    if (page.settings !== undefined) return 'settings:read';
    return null;
}

/** Validate and flatten a plugin's pages into serializable metadata. */
export function derivePluginPages(
    identity: ResolvedPluginIdentity,
    def: PluginDefinition
): DerivedPluginPage[] {
    return (def.admin?.pages ?? []).map((page) => {
        if (page.component === undefined && page.settings === undefined) {
            throw new Error(
                `Astromech plugin "${identity.package}" page "${page.path}" needs ` +
                    `a \`component\` or a \`settings\` schema.`
            );
        }
        return {
            key: `${identity.name}${page.path}`,
            label: page.label,
            permission: resolvePagePermission(identity.permissionNamespace, page),
            settings: page.settings ?? null,
            hasComponent: page.component !== undefined,
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
    const entryChildren: PluginNavItem[] = Object.entries(def.entries ?? {}).map(
        ([type, entryType]) => {
            // Matches the mounted entries API guard exactly:
            // `plugin:{permissionNamespace}:entry:{type}:{action}`. Built
            // directly (not via resolvePluginPermission, which only namespaces
            // bare keys and would pass this `:`-containing string through).
            const item: PluginNavItem = {
                label: entryType.plural,
                to: `/plugin/${identity.name}/entries/${type}`,
                permission: `plugin:${identity.permissionNamespace}:entry:${type}:read`,
            };
            return item;
        }
    );

    const pageChildren = (def.admin?.pages ?? [])
        .filter((page) => page.nav !== false)
        .map((page) => {
            const item: PluginNavItem = {
                label: page.label,
                to: `/plugin/${identity.name}${page.path}`,
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
