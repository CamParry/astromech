/**
 * Derivation of a plugin's admin-shell metadata from `admin.pages` — pages
 * are the core concept (spec §3.5): each page may declare `nav` to appear in
 * the sidebar and `settings` to auto-render a settings form. The sidebar
 * tree and the serializable page list are both derived here, with permission
 * strings resolved (`resolvePluginPermission`) so the browser never needs to
 * know the namespacing rule.
 */

import type {
    PluginAdmin,
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

function resolvePagePermission(namespace: string, page: PluginPage): string | null {
    if (page.permission !== undefined) {
        return resolvePluginPermission(namespace, page.permission);
    }
    // Settings pages read/write the core settings table — gate accordingly.
    if (page.settings !== undefined) return 'settings:read';
    return null;
}

/** Validate and flatten a plugin's pages into serializable metadata. */
export function derivePluginPages(
    identity: ResolvedPluginIdentity,
    admin: PluginAdmin | undefined
): DerivedPluginPage[] {
    return (admin?.pages ?? []).map((page) => {
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
 * Sidebar tree for one plugin: nav-visible pages become children of a single
 * group labelled by `admin.nav` (default: the access key). The sidebar
 * auto-flattens single-child groups.
 */
export function derivePluginNav(
    identity: ResolvedPluginIdentity,
    admin: PluginAdmin | undefined
): PluginNavItem[] {
    const visible = (admin?.pages ?? []).filter(
        (page) => page.nav !== undefined && page.nav !== false
    );
    if (visible.length === 0) return [];

    const children = visible.map((page) => {
        const nav = typeof page.nav === 'object' ? page.nav : {};
        const item: PluginNavItem = {
            label: nav.label ?? page.label,
            to: `/plugin/${identity.name}${page.path}`,
        };
        if (nav.icon !== undefined) item.icon = nav.icon;
        const permission = resolvePagePermission(identity.permissionNamespace, page);
        if (permission !== null) item.permission = permission;
        return item;
    });

    const group: PluginNavItem = {
        label: admin?.nav?.label ?? identity.name,
        children,
    };
    if (admin?.nav?.icon !== undefined) group.icon = admin.nav.icon;
    return [group];
}
