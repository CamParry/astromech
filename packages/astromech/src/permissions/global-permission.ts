/**
 * Global permission helpers — the single source for `global:{key}:{action}`
 * and `plugin:{ns}:global:{key}:{action}` strings, imported by both the HTTP
 * route mounts and the method manifest so the two can never drift.
 */

import { QUALIFIED_SEPARATOR } from '@/entries/entry-types.shared';

/** The actions a global permission gates. A global is never created or deleted. */
export type GlobalAction = 'read' | 'update' | 'publish';

/** Permission for a host global, e.g. `global:site:update`. */
export function rootGlobalPermission(key: string, action: GlobalAction): string {
    return `global:${key}:${action}`;
}

/** Permission for a plugin's global, e.g. `plugin:seo:global:settings:update`. */
export function pluginGlobalPermission(
    permissionNamespace: string,
    key: string,
    action: GlobalAction
): string {
    return `plugin:${permissionNamespace}:global:${key}:${action}`;
}

/**
 * Derive the permission an action on `globalId` checks, from the id alone: a
 * qualified id (`<namespace>/<key>`) yields the plugin form, a bare id the host
 * form — what stops a `global:*` grant reaching a plugin's globals.
 */
export function globalPermission(globalId: string, action: GlobalAction): string {
    const index = globalId.indexOf(QUALIFIED_SEPARATOR);
    if (index === -1) return rootGlobalPermission(globalId, action);
    return pluginGlobalPermission(
        globalId.slice(0, index),
        globalId.slice(index + 1),
        action
    );
}

/**
 * The permissions for several actions on one global — what a site grants a
 * role for a plugin's global.
 */
export function globalPermissions(
    globalId: string,
    ...actions: GlobalAction[]
): string[] {
    if (actions.length === 0) {
        throw new Error(
            `globalPermissions("${globalId}") needs at least one action. ` +
                `Pass the actions to grant, e.g. globalPermissions("${globalId}", 'read', 'update').`
        );
    }
    return actions.map((action) => globalPermission(globalId, action));
}
