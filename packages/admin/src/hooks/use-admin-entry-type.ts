/**
 * One entry type as the admin pages use it, from its type id: its config, link
 * base, label namespace and what the signed-in user may do with it. The site's
 * types and a plugin's are read the same way, from `AdminConfig.entryTypes`.
 */

import type { AdminEntryType, EntryAction } from 'astromech';
import { entryPermission } from 'astromech/shared';
import adminConfig from 'virtual:astromech/admin-config';
import { labelNamespace } from '../i18n/entry-namespace';
import { entryTypeBasePath } from '../utilities/entry-admin-path';
import { usePermissions } from './use-permissions';

export type UseAdminEntryTypeResult = {
    /** The id the entries service is called with: `post`, or `forms/form` for a plugin's. */
    type: string;
    config: AdminEntryType;
    /** Link base: `/entries/post`, or `/plugin/forms/entries/form`. */
    basePath: string;
    /** The i18n namespace the type's labels resolve against. */
    namespace: string;
    can: (action: EntryAction) => boolean;
};

/** The entry type `type` names, or `null` when the config declares none. */
export function useAdminEntryType(type: string): UseAdminEntryTypeResult | null {
    const { hasPermission } = usePermissions();
    const config = Object.hasOwn(adminConfig.entryTypes, type)
        ? adminConfig.entryTypes[type]
        : undefined;
    if (config === undefined) return null;
    return {
        type,
        config,
        basePath: entryTypeBasePath(type),
        namespace: labelNamespace(config.plugin),
        can: (action) => hasPermission(entryPermission(type, action)),
    };
}
