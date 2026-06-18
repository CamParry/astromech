/**
 * Admin config builder — assembles the serializable shape exposed to the
 * admin SPA via the `virtual:astromech/admin-config` virtual module.
 */

import type { AstromechConfig, ResolvedConfig } from '@/types/index.js';
import type {
    AdminConfig,
    AdminEntryTypeConfig,
    ResolvedAdminPage,
    ResolvedEntryTypeConfig,
} from '@/types/config.js';
import { resolveRoles } from '@/permissions/index.js';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity.js';
import {
    derivePluginNav,
    derivePluginPages,
    resolvePluginLabel,
} from '@/plugins/runtime/plugin-admin.js';

/**
 * Project a resolved entry type into the serializable admin shape. Shared by
 * root entries and plugin-namespaced entries so the two never drift.
 */
export function toAdminEntryType(
    entryType: ResolvedEntryTypeConfig
): AdminEntryTypeConfig {
    return {
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
    };
}

export function buildAdminConfig(
    config: AstromechConfig,
    resolvedConfig: ResolvedConfig
): AdminConfig {
    const resolvedRoles = resolveRoles(config);
    return {
        plugins: (config.plugins ?? []).map((p) => {
            const identity = resolvePluginIdentity(p);
            const pluginEntries = resolvedConfig.pluginEntries[identity.name] ?? {};
            return {
                name: identity.name,
                label: resolvePluginLabel(p, identity),
                permissionNamespace: identity.permissionNamespace,
                nav: derivePluginNav(identity, p),
                entries: Object.fromEntries(
                    Object.entries(pluginEntries).map(([name, entryType]) => [
                        name,
                        toAdminEntryType(entryType),
                    ])
                ),
                pages: derivePluginPages(identity, p) as ResolvedAdminPage[],
            };
        }),
        adminRoute: resolvedConfig.adminRoute,
        apiRoute: resolvedConfig.apiRoute,
        locales: resolvedConfig.locales ?? [],
        defaultLocale: resolvedConfig.defaultLocale ?? 'en',
        roles: Object.entries(resolvedRoles).map(([slug, r]) => ({ slug, name: r.name })),
        entries: Object.fromEntries(
            Object.entries(resolvedConfig.entries).map(([name, entryType]) => [
                name,
                toAdminEntryType(entryType),
            ])
        ),
        pages: resolvedConfig.adminPages,
    };
}
