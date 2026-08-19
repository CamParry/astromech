/**
 * Admin config builder — assembles the serializable shape exposed to the
 * admin SPA via the `virtual:astromech/admin-config` virtual module.
 */

import type {
    AdminConfig,
    AdminEntryType,
    ResolvedAdminPage,
    ResolvedEntryType,
} from '@/types/config';
import type { AstromechConfig, ResolvedConfig } from '@/types/index';
import {
    derivePluginNav,
    derivePluginPages,
    resolvePluginLabel,
} from '@/plugins/runtime/plugin-admin';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';
import { defaultImageWidths, normaliseWidths } from '@/utilities/image-widths';

/**
 * Project a resolved entry type into the serializable admin shape. Shared by
 * root entries and plugin-namespaced entries so the two never drift.
 */
export function toAdminEntryType(entryType: ResolvedEntryType): AdminEntryType {
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
    const resolvedRoles = resolvedConfig.resolvedRoles;
    return {
        plugins: (config.plugins ?? []).map((p) => {
            const identity = resolvePluginIdentity(p);
            const pluginEntries = resolvedConfig.pluginEntries[identity.namespace] ?? {};
            return {
                namespace: identity.namespace,
                serviceKey: identity.serviceKey,
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
        basePath: resolvedConfig.basePath,
        mediaRoute: resolvedConfig.mediaRoute,
        // No driver means no variants exist to request — the admin falls back
        // to the original rather than asking for a width that would 404.
        imageWidths: config.media?.image
            ? normaliseWidths(config.media.image.widths ?? defaultImageWidths)
            : [],
        imageAvif: config.media?.image?.avif ?? true,
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
