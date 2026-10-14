/**
 * Security permissions: the actions, the builder for `security:{action}`
 * strings, and the declarations. Pure, so the admin reaches the builder through
 * `astromech/shared`.
 */

import type { PermissionDeclaration } from '@/permissions/permission';

/**
 * The actions a security permission gates. After CASL's `manage`, which stands
 * for every action on a subject.
 */
export const SECURITY_ACTIONS = ['manage'] as const;

/** One of {@link SECURITY_ACTIONS}. */
export type SecurityAction = (typeof SECURITY_ACTIONS)[number];

/** The permission `action` on the address lists checks, e.g. `security:manage`. */
export function securityPermission<A extends SecurityAction>(action: A): `security:${A}` {
    return `security:${action}`;
}

/** Every security permission core declares, one per action. */
export const SECURITY_PERMISSIONS = {
    'security:manage': {
        label: 'Manage security',
        description: 'View and change the blocked and allowed addresses.',
    },
} satisfies Record<`security:${SecurityAction}`, PermissionDeclaration>;
