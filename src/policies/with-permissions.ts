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

import type { Permission, Role, ServiceMethodDescriptor } from '@/types/index.js';
import { can } from '@/permissions/index.js';

export type Permissions = {
    /** True if the principal holds `permission`. A null principal holds nothing. */
    allows(permission: Permission): boolean;
    /**
     * True if the principal may call `method` with `input`. Reads the method's
     * declared `permission` (resolving an input-dependent rule); a method that
     * declares no permission is public and always allowed.
     */
    allowsMethod<Input>(method: ServiceMethodDescriptor<Input>, input?: Input): boolean;
};

/**
 * Compose a permission guard over a principal. A missing principal (an
 * unauthenticated request on an optional-auth route) is allowed nothing.
 */
export function withPermissions(principal: Role | undefined): Permissions {
    const allows = (permission: Permission): boolean =>
        principal ? can(principal, permission) : false;

    return {
        allows,
        allowsMethod(method, input) {
            const rule = method.permission;
            if (rule === undefined) return true; // public method — no permission gate
            return allows(typeof rule === 'function' ? rule(input as never) : rule);
        },
    };
}
