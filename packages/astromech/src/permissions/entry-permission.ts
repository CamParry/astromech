/**
 * Entry permission helpers — the single source for the `entry:{type}:{action}`
 * and `plugin:{ns}:entry:{type}:{action}` permission strings. Both the HTTP
 * route mounts and the method manifest import from here so the strings can
 * never drift between enforcement and documentation.
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
 * Derive the permission an action on `typeId` checks, from the type id alone.
 *
 * There is one entries router, so the shape of the id is the only signal for
 * which permission form applies: a qualified id (`<namespace>/<type>`) yields
 * the plugin form, a bare id the root form. Keeping the two apart is what stops
 * an `entry:*` grant from reaching plugin entries.
 *
 * Safe as a pure string operation — `permissionNamespace` is the namespace
 * verbatim (`plugins/runtime/plugin-identity.ts`) and namespaces are
 * collision-checked at config resolve time, so nothing here inverts a lossy
 * derivation.
 */
export function entryPermission(typeId: string, action: EntryAction): string {
    const index = typeId.indexOf(QUALIFIED_SEPARATOR);
    if (index === -1) return rootEntryPermission(typeId, action);
    return pluginEntryPermission(typeId.slice(0, index), typeId.slice(index + 1), action);
}

/**
 * The permissions for several actions on one entry type — what a site grants a
 * role for a plugin's entry type, now that plugins no longer hand-declare them:
 *
 * ```ts
 * ...entryPermissions('redirects/redirect', 'read', 'create', 'update', 'delete')
 * ```
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
