/**
 * Deriving the set of publicly-readable setting keys from the admin pages and
 * the author's `publicSettings` list.
 */

import type { ResolvedAdminPage } from '@/types/index';
import type { PluginDefinition } from '@/types/plugins';
import { resolvePluginIdentity } from '@/plugins/runtime/plugin-identity';

/**
 * Each source contributes both an exact key and a `key:` prefix, so a
 * translatable key exposes its per-locale variants too. An entry already
 * a prefix (ends with `:`) is taken as written.
 */
export function resolvePublicSettingKeys(options: {
    adminPages: readonly ResolvedAdminPage[];
    plugins: readonly PluginDefinition[];
    publicSettings: readonly string[] | undefined;
}): string[] {
    const keys: string[] = [];

    const addKey = (key: string): void => {
        if (!keys.includes(key)) keys.push(key);
    };

    const addBaseKey = (baseKey: string): void => {
        addKey(baseKey);
        addKey(`${baseKey}:`);
    };

    for (const page of options.adminPages) {
        if (page.public) addBaseKey(page.baseKey);
    }
    for (const plugin of options.plugins) {
        const identity = resolvePluginIdentity(plugin);
        for (const page of plugin.admin?.pages ?? []) {
            if (page.public) {
                addBaseKey(`plugin:${identity.permissionNamespace}:${page.path}`);
            }
        }
    }
    for (const key of options.publicSettings ?? []) {
        if (key.endsWith(':')) addKey(key);
        else addBaseKey(key);
    }

    return keys;
}
