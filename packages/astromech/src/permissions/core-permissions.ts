/**
 * The permissions core itself enforces, and the one cross-cutting key that
 * changes the shape of a read rather than gating a call.
 */

import type { Permission } from '@/types/domain';
import { defineAbsolutePermissions } from '@/permissions/define';

/**
 * Every permission core itself enforces — the core half of the permission
 * catalogue, declared through {@link defineAbsolutePermissions} since these
 * keys are already full strings (core is the root namespace).
 */
export const CORE_PERMISSIONS = defineAbsolutePermissions({
    'admin:access': {
        label: 'Access the admin',
        description: 'Sign in to the admin UI. Every admin page requires it.',
    },
    'media:read': { label: 'View media' },
    'media:upload': {
        label: 'Upload media',
        description: 'Add new files to the media library.',
    },
    'media:update': {
        label: 'Update media',
        description: "Edit an existing item's alt text, title and caption.",
    },
    'media:delete': { label: 'Delete media' },
    'settings:read': { label: 'View settings' },
    'settings:update': { label: 'Update settings' },
    'users:read': { label: 'View users' },
    'users:create': { label: 'Create users' },
    'users:update': {
        label: 'Update users',
        description: "Edit a user's profile, role and password.",
    },
    'users:delete': { label: 'Delete users' },
    'entry:read:full': {
        label: 'Read full entry shape',
        description:
            'Read the admin/editor shape of any entry — drafts and unpublished fields included — rather than the public shape.',
    },
});

/** Core permission keys, literal-typed. */
export type CorePermissionKey = keyof typeof CORE_PERMISSIONS;

/** Select core permissions by key — a typo is a compile error, not a dead grant. */
export function corePermissions(...keys: CorePermissionKey[]): Permission[] {
    return [...keys];
}

/**
 * Cross-cutting permission: request the full (admin/editor) shape on any
 * entry read. Covered by `entry:*` (editor) and `*` (admin) via the
 * trailing-wildcard matcher.
 */
export const PERMISSION_ENTRY_READ_FULL = 'entry:read:full' as Permission;
