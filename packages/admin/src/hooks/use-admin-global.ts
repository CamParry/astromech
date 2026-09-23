/**
 * One global as the admin pages use it, from its id: its config, link base,
 * label namespace and what the signed-in user may do with it. The site's
 * globals and a plugin's are read the same way, from `AdminConfig.globals`.
 */

import type { AdminGlobal, GlobalAction } from 'astromech';
import { globalPermission } from 'astromech/shared';
import adminConfig from 'virtual:astromech/admin-config';
import { labelNamespace } from '../i18n/entry-namespace';
import { globalBasePath } from '../utilities/global-admin-path';
import { usePermissions } from './use-permissions';

export type UseAdminGlobalResult = {
    /** The id the globals service is called with: `site`, or `seo/settings` for a plugin's. */
    key: string;
    config: AdminGlobal;
    /** Link base: `/globals/site`, or `/plugin/seo/globals/settings`. */
    basePath: string;
    /** The i18n namespace the global's labels resolve against. */
    namespace: string;
    can: (action: GlobalAction) => boolean;
};

/** The global `key` names, or `null` when the config declares none. */
export function useAdminGlobal(key: string): UseAdminGlobalResult | null {
    const { hasPermission } = usePermissions();
    const config = Object.hasOwn(adminConfig.globals, key)
        ? adminConfig.globals[key]
        : undefined;
    if (config === undefined) return null;
    return {
        key,
        config,
        basePath: globalBasePath(key),
        namespace: labelNamespace(config.plugin),
        can: (action) => hasPermission(globalPermission(key, action)),
    };
}
