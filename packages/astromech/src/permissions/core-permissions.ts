/**
 * The one permission no resource owns: `admin:access`, the admin panel's
 * sign-in check. Each resource declares its own permissions in its module's
 * `permissions.ts`.
 */

import type { PermissionDeclarations } from '@/permissions/permission';

/**
 * The permission core declares outside any resource. Its key is already a
 * full string (core is the root namespace), so nothing namespaces it as a
 * `definePermissions` key is.
 */
export const ADMIN_PERMISSIONS = {
    'admin:access': {
        label: 'Access the admin',
        description: 'Sign in to the admin UI. Every admin page requires it.',
    },
} satisfies PermissionDeclarations;
