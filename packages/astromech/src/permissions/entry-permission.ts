/**
 * Entry permission helpers — the single source for the `entry:{type}:{action}`
 * and `plugin:{ns}:entry:{type}:{action}` permission strings. Both the HTTP
 * route mounts and the method manifest import from here so the strings can
 * never drift between enforcement and documentation.
 */

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
