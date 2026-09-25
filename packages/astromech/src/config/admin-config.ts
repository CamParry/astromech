/**
 * Admin config builder — assembles the serializable shape exposed to the
 * admin SPA via the `virtual:astromech/admin-config` virtual module.
 */

import type {
    AdminConfig,
    AdminEntryType,
    AdminGlobal,
    ResolvedEntryType,
    ResolvedGlobal,
} from '@/types/config';
import type { AstromechConfig, ResolvedConfig } from '@/types/index';
import { defaultImageWidths, normaliseWidths } from '@/media/image-widths';
import {
    derivePluginNav,
    derivePluginPages,
    resolvePluginLabel,
} from '@/plugins/runtime/plugin-admin';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';
import { resolveAdminResources } from '@/plugins/runtime/plugin-resources';

/** Project a resolved entry type, the site's or a plugin's, into the serializable admin shape. */
export function toAdminEntryType(entryType: ResolvedEntryType): AdminEntryType {
    return {
        ...(entryType.plugin !== undefined ? { plugin: entryType.plugin } : {}),
        single: entryType.single,
        plural: entryType.plural,
        versioning: !!entryType.versioning,
        translatable: entryType.translatable ?? false,
        slug: entryType.slug ? entryType.slug : null,
        adminColumns: entryType.adminColumns ?? [],
        fields: entryType.fields,
        url: entryType.url ?? null,
        capabilities: entryType.capabilities,
        titleField: entryType.titleField,
        ...(entryType.icon !== undefined ? { icon: entryType.icon } : {}),
        ...(entryType.views !== undefined ? { views: entryType.views } : {}),
        ...(entryType.defaultView !== undefined
            ? { defaultView: entryType.defaultView }
            : {}),
        ...(entryType.gridFields !== undefined
            ? { gridFields: entryType.gridFields }
            : {}),
        ...(entryType.search !== undefined ? { search: entryType.search } : {}),
        ...(entryType.customTable ? { customTable: true as const } : {}),
    };
}

/** Project a resolved global, the site's or a plugin's, into the serializable admin shape. */
function toAdminGlobal(global: ResolvedGlobal): AdminGlobal {
    return {
        ...(global.plugin !== undefined ? { plugin: global.plugin } : {}),
        label: global.label,
        fields: global.fields,
        capabilities: global.capabilities,
        public: global.public ?? false,
        nav: global.nav !== false,
        ...(global.icon !== undefined ? { icon: global.icon } : {}),
    };
}

/** Build the full `AdminConfig` — plugins, roles, locales, entries, and pages — served to the virtual module. */
export function buildAdminConfig(
    config: AstromechConfig,
    resolvedConfig: ResolvedConfig
): AdminConfig {
    const resolvedRoles = resolvedConfig.resolvedRoles;
    return {
        plugins: (config.plugins ?? []).map((p) => {
            const identity = resolvePluginIdentity(p);
            return {
                namespace: identity.namespace,
                serviceKey: identity.serviceKey,
                label: resolvePluginLabel(p, identity),
                permissionNamespace: identity.permissionNamespace,
                nav: derivePluginNav(identity, p, resolvedConfig),
                pages: derivePluginPages(identity, p),
                resources: resolveAdminResources(identity, p),
            };
        }),
        basePath: resolvedConfig.basePath,
        mediaRoute: resolvedConfig.mediaRoute,
        media: { translatable: resolvedConfig.media.translatable },
        users: {
            translatable: resolvedConfig.users.translatable,
            fields: resolvedConfig.users.fields,
        },
        // No driver means no variants exist to request — the admin falls back
        // to the original rather than asking for a width that would 404.
        imageWidths: config.media?.image
            ? normaliseWidths(config.media.image.widths ?? defaultImageWidths)
            : [],
        imageAvif: config.media?.image?.avif ?? true,
        locales: resolvedConfig.locales ?? [],
        defaultLocale: resolvedConfig.defaultLocale ?? 'en',
        roles: Object.entries(resolvedRoles).map(([slug, r]) => ({ slug, name: r.name })),
        entryTypes: Object.fromEntries(
            Object.entries(resolvedConfig.entryTypes).map(([id, entryType]) => [
                id,
                toAdminEntryType(entryType),
            ])
        ),
        globals: Object.fromEntries(
            Object.entries(resolvedConfig.globals).map(([id, global]) => [
                id,
                toAdminGlobal(global),
            ])
        ),
        pages: resolvedConfig.adminPages,
    };
}
