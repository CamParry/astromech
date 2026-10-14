/**
 * Entry permissions: the actions, the builder that is the single source for
 * `entry:{type}:{action}` and `plugin:{ns}:entry:{type}:{action}` strings, and
 * the declarations. The HTTP route mounts and the method manifest both build
 * their strings here, so the two can never drift. Pure, so the admin reaches
 * the builder through `astromech/shared`.
 */

import type { Permission, PermissionDeclarations } from '@/permissions/permission';
import { QUALIFIED_SEPARATOR } from '@/entries/entry-types';

/** The CRUD+publish actions an entry permission gates. */
export const ENTRY_ACTIONS = ['read', 'create', 'update', 'delete', 'publish'] as const;

/** One of {@link ENTRY_ACTIONS}. */
export type EntryAction = (typeof ENTRY_ACTIONS)[number];

/** Permission for a root-mounted entry type, e.g. `entry:posts:create`. */
export function rootEntryPermission(type: string, action: EntryAction): string {
    return `entry:${type}:${action}`;
}

/** Permission for a plugin-mounted entry type, e.g. `plugin:forms:entry:form:create`. */
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

/**
 * Cross-cutting permission: request the full (admin/editor) shape on any
 * entry read. Covered by `entry:*` (editor) and `*` (admin) via the
 * trailing-wildcard matcher.
 */
export const PERMISSION_ENTRY_READ_FULL = 'entry:read:full' as Permission;

/**
 * The entry permission core declares. Each type's own permissions are derived
 * from the config, and {@link entryPermissionLabel} names them.
 */
export const ENTRY_PERMISSIONS = {
    'entry:read:full': {
        label: 'Read full entry shape',
        description:
            'Read the admin/editor shape of any entry — drafts and unpublished fields included — rather than the public shape.',
    },
} satisfies PermissionDeclarations;

/** What a matrix view shows for one type's permission, e.g. 'Update "posts" entries'. */
export function entryPermissionLabel(action: EntryAction, type: string): string {
    const verb = action.charAt(0).toUpperCase() + action.slice(1);
    return `${verb} "${type}" entries`;
}
