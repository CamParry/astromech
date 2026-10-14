/**
 * User permissions: the actions, the builder for `users:{action}` strings, and
 * the declarations. Pure, so the admin reaches the builder through
 * `astromech/shared`.
 */

import type { PermissionDeclaration } from '@/permissions/permission';

/** The actions a user permission gates. */
export const USER_ACTIONS = ['read', 'create', 'update', 'delete'] as const;

/** One of {@link USER_ACTIONS}. */
export type UserAction = (typeof USER_ACTIONS)[number];

/** The permission `action` on users checks, e.g. `users:update`. */
export function userPermission<A extends UserAction>(action: A): `users:${A}` {
    return `users:${action}`;
}

/** Every user permission core declares, one per action. */
export const USER_PERMISSIONS = {
    'users:read': { label: 'View users' },
    'users:create': { label: 'Create users' },
    'users:update': {
        label: 'Update users',
        description: "Edit a user's profile, email and role.",
    },
    'users:delete': { label: 'Delete users' },
} satisfies Record<`users:${UserAction}`, PermissionDeclaration>;
