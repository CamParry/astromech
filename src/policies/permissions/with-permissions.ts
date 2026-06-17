/**
 * `withPermissions(principal)` — the composable permission policy.
 *
 * Composes a principal (the resolved `Role`) into a permission guard: the single
 * enforcement seam. The HTTP API composes it; trusted transports (the Local API
 * for SSR/hooks, the CLI) compose nothing and never check — the rule is "you
 * can't do what you weren't handed," not "everything unless you remember to say
 * don't."
 *
 * Stage 4: routes still name the permission inline (`permissions.allows('x')`).
 * Stage 5: each service method declares its `permission` on its descriptor and
 * this guard reads that declaration instead of taking it inline.
 */

import type { Permission, Role } from '@/types/index.js';
import { can } from './permissions.js';

export type Permissions = {
    /** True if the principal holds `permission`. A null principal holds nothing. */
    allows(permission: Permission): boolean;
};

/**
 * Compose a permission guard over a principal. A missing principal (an
 * unauthenticated request on an optional-auth route) is allowed nothing.
 */
export function withPermissions(principal: Role | undefined): Permissions {
    return {
        allows: (permission) => (principal ? can(principal, permission) : false),
    };
}
