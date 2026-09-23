/**
 * Turns an authored `AstromechConfig` into the `ResolvedConfig` the runtime
 * reads. Orchestration only — each step lives in its own module beside this one.
 */

import type { AstromechConfig, ResolvedAdminPage, ResolvedConfig } from '@/types/index';
import { resolveAdminPage } from '@/config/admin-pages';
import { resolveEntryTypes } from '@/config/entry-types';
import { resolveGlobals } from '@/config/globals';
import { assertPluginsValid } from '@/config/plugins';
import { resolvePublicSettingKeys } from '@/config/public-settings';
import { assertMediaAccessCompatible } from '@/config/validate/media-access';
import { assertRelationshipTargets } from '@/config/validate/relationships';
import { assertUniqueDataNames, validateFieldTree } from '@/fields/field-tree';
import { setPluginFieldTypes } from '@/fields/field-type-registry';
import { resolveRoles } from '@/permissions/roles';
import { pluginFieldTypes } from '@/plugins/runtime/plugin-fields';

/** Resolve the config with defaults and plugin merging. */
export function resolveConfig(config: AstromechConfig): ResolvedConfig {
    const plugins = config.plugins ?? [];
    assertPluginsValid(plugins);
    // Before any field tree is read: parse, codegen and validation look plugin
    // types up in the same registry as core's.
    setPluginFieldTypes(pluginFieldTypes(plugins));

    const entryTypes = resolveEntryTypes(config);
    const globals = resolveGlobals(config);
    assertRelationshipTargets(entryTypes);

    const adminPages: ResolvedAdminPage[] = (config.admin?.pages ?? []).map(
        resolveAdminPage
    );

    const publicSettingKeys = resolvePublicSettingKeys(config.publicSettings);

    for (const [owner, fields] of [
        ['media', config.media?.fields ?? []],
        ['users', config.users?.fields ?? []],
    ] as const) {
        validateFieldTree(owner, fields);
        assertUniqueDataNames(owner, { main: fields, sidebar: [] });
    }

    const mediaAccess = config.media?.access ?? 'public';
    assertMediaAccessCompatible(mediaAccess, config.media?.image?.driver.name);

    // `image` carries a live driver and `media` is picked into
    // `PluginConfigView`, so it is dropped here rather than only in the type.
    const { image: _image, ...media } = config.media ?? {};

    // The registry-held modules, `plugins` and the authored `entries` and
    // `globals` are destructured out to match `ResolvedConfig`'s `Omit`, so the
    // strip holds at runtime too; the resolved maps replace them below.
    const {
        db: _db,
        storage: _storage,
        email: _email,
        scheduler: _scheduler,
        ai: _ai,
        plugins: _plugins,
        entries: _entries,
        globals: _globals,
        ...rest
    } = config;

    return {
        ...rest,
        basePath: config.basePath ?? '/cms',
        mediaRoute: config.mediaRoute ?? '/_media',
        migrationsDir: config.migrationsDir ?? './migrations',
        media: {
            ...media,
            access: mediaAccess,
            translatable: config.media?.translatable ?? false,
        },
        users: {
            fields: config.users?.fields ?? [],
            ...(config.users?.validate ? { validate: config.users.validate } : {}),
            translatable: config.users?.translatable ?? false,
        },
        entryTypes,
        globals,
        adminPages,
        trash: {
            enabled: config.trash?.enabled ?? true,
            retentionDays: config.trash?.retentionDays ?? 30,
        },
        publicSettingKeys,
        resolvedRoles: resolveRoles(config),
        timezone: config.timezone ?? 'UTC',
    };
}
