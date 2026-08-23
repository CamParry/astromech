/**
 * Turns an authored `AstromechConfig` into the `ResolvedConfig` the runtime
 * reads. Orchestration only — each step lives in its own module beside this one.
 */

import type {
    AstromechConfig,
    ResolvedAdminPage,
    ResolvedConfig,
    ResolvedEntryType,
} from '@/types/index';
import { resolveAdminPage } from '@/config/admin-pages';
import { toResolvedEntryType } from '@/config/entry-types';
import { assertPluginsValid, resolvePluginEntries } from '@/config/plugin-entries';
import { resolvePublicSettingKeys } from '@/config/public-settings';
import { assertMediaAccessCompatible } from '@/config/validate/media-access';
import { assertQualifiedRelationshipTargets } from '@/config/validate/relationships';
import { BUILT_IN_SUPPORTS } from '@/entries/capabilities';
import { resolveRoles } from '@/permissions/index';

/** Resolve the config with defaults and plugin merging. */
export function resolveConfig(config: AstromechConfig): ResolvedConfig {
    const plugins = config.plugins ?? [];
    assertPluginsValid(plugins);

    const entries: Record<string, ResolvedEntryType> = {};
    for (const [typeKey, entryType] of Object.entries(config.entries)) {
        entries[typeKey] = toResolvedEntryType(
            typeKey,
            entryType,
            entryType.repository?.supports ?? BUILT_IN_SUPPORTS
        );
    }

    const pluginEntries = resolvePluginEntries(plugins);

    assertQualifiedRelationshipTargets({ entries, pluginEntries });

    const adminPages: ResolvedAdminPage[] = (config.admin?.pages ?? []).map(
        resolveAdminPage
    );

    const publicSettingKeys = resolvePublicSettingKeys({
        adminPages,
        plugins,
        publicSettings: config.publicSettings,
    });

    const mediaAccess = config.media?.access ?? 'public';
    assertMediaAccessCompatible(mediaAccess, config.media?.image?.driver.name);

    // `image` carries a live driver and `media` is picked into
    // `PluginConfigView`, so it is dropped here rather than only in the type.
    const { image: _image, ...media } = config.media ?? {};

    // The registry-held modules and `plugins` are destructured out to match
    // `ResolvedConfig`'s `Omit`, so the strip holds at runtime too.
    const {
        db: _db,
        storage: _storage,
        email: _email,
        scheduler: _scheduler,
        ai: _ai,
        plugins: _plugins,
        ...rest
    } = config;

    return {
        ...rest,
        basePath: config.basePath ?? '/cms',
        mediaRoute: config.mediaRoute ?? '/_media',
        media: { ...media, access: mediaAccess },
        entries,
        pluginEntries,
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
