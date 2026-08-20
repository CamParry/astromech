/**
 * Entry permission helpers — the single source for `entry:{type}:{action}`
 * and `plugin:{ns}:entry:{type}:{action}` strings, imported by both the
 * HTTP route mounts and the method manifest so the two can never drift.
 */

import { QUALIFIED_SEPARATOR } from '@/entries/type-ids.shared';

/** The CRUD+publish actions an entry permission gates. */
export type EntryAction = 'read' | 'create' | 'update' | 'delete' | 'publish';

/** Permission for a root-mounted entry type, e.g. `entry:posts:create`. */
export function rootEntryPermission(type: string, action: EntryAction): string {
    return `entry:${type}:${action}`;
}

/** Permission for a plugin-mounted entry type, e.g. `plugin:redirects:entry:redirect:create`. */
export function pluginEntryPermission(
    permissionNamespace: string,
    type: string,
    action: EntryAction
): string {
    return `plugin:${permissionNamespace}:entry:${type}:${action}`;
}

/**
 * Derive the permission an action on `typeId` checks, from the type id
 * alone: a qualified id (`<namespace>/<type>`) yields the plugin form, a
 * bare id the root form — what stops an `entry:*` grant reaching plugin entries.
 */
export function entryPermission(typeId: string, action: EntryAction): string {
    const index = typeId.indexOf(QUALIFIED_SEPARATOR);
    if (index === -1) return rootEntryPermission(typeId, action);
    return pluginEntryPermission(typeId.slice(0, index), typeId.slice(index + 1), action);
}

/**
 * The permissions for several actions on one entry type — what a site
 * grants a role for a plugin's entry type.
 */
export function entryPermissions(typeId: string, ...actions: EntryAction[]): string[] {
    if (actions.length === 0) {
        throw new Error(
            `entryPermissions("${typeId}") needs at least one action. ` +
                `Pass the actions to grant, e.g. entryPermissions("${typeId}", 'read', 'update').`
        );
    }
    return actions.map((action) => entryPermission(typeId, action));
}
