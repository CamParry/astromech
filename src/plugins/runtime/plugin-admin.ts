/**
 * Derivation of a plugin's admin-shell metadata from `admin.pages` — pages
 * are the core concept: each page is a `component` view or an auto-rendered
 * `fields` form, and appears in the sidebar unless it opts out (`nav: false`).
 * The sidebar tree (grouped under the plugin's `label`/`icon`) and the
 * serializable page list are both derived here, with permission strings
 * resolved (`resolvePluginPermission`) so the browser never needs to know the
 * namespacing rule.
 *
 * Both origins (host and plugin) produce `ResolvedAdminPage` so the renderer
 * is origin-agnostic. The only difference is:
 * - Host:   `baseKey = path`, `key = path`, permission defaults `settings:read`
 * - Plugin: `baseKey = 'plugin:<ns>:<path>'`, `key = '<name><path>'`, permission
 *           defaults `settings:read` for settings pages, null for component pages.
 */

import type {
    AdminPage,
    PluginDefinition,
    PluginNavItem,
    ResolvedAdminPage,
    ResolvedPluginIdentity,
} from '@/types/index.js';
import type { EntryFields, ResolvedEntryFields } from '@/types/fields.js';
import {
    pluginEntryTypes,
    resolvePluginPermission,
    titleCaseAlias,
} from './plugin-identity.js';

// ---------------------------------------------------------------------------
// Field normalisation (mirrors config-resolver's toResolvedFields)
// ---------------------------------------------------------------------------

function toResolvedFields(fields: EntryFields | undefined): ResolvedEntryFields {
    if (fields === undefined) return { main: [], sidebar: [] };
    if (Array.isArray(fields)) return { main: fields, sidebar: [] };
    return { main: fields.main, sidebar: fields.sidebar ?? [] };
}

/**
 * Admin display name: plugin `label` if set, otherwise the access key
 * title-cased (`redirects` → `Redirects`) so a label-less plugin never
 * renders a bare lowercase alias in the sidebar.
 */
export function resolvePluginLabel(
    def: PluginDefinition,
    identity: ResolvedPluginIdentity
): string {
    return def.label ?? titleCaseAlias(identity.name);
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
        const key = `${identity.name}${page.path}`;

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
            // page.label is Label (string | i18n descriptor); resolve to string
            // for the nav item (PluginNavItem.label is string). Plain strings
            // pass through; i18n descriptors carry their key (resolved in the
            // browser via resolveLabel). We store the raw value here and the
            // sidebar resolves it — PluginNavItem.label must be string, so for
            // i18n descriptors we use the $t key as a fallback display value
            // until the browser resolves it.
            const labelStr: string =
                typeof page.label === 'string' ? page.label : page.label.$t;

            const item: PluginNavItem = {
                label: labelStr,
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
