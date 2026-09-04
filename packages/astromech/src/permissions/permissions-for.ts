/**
 * `permissionsFor(role)` — a role composed into a permission guard, the single
 * enforcement seam. The HTTP API composes it; trusted transports (the Local API
 * for SSR/hooks, the CLI) compose nothing and never check.
 */

import type { Permission, Role, ServiceMethodContract } from '@/types/index';
import { resolveAccess } from '@/permissions/access';
import { can } from '@/permissions/roles';

export type Permissions = {
    /** True if the role holds `permission`. A missing role holds nothing. */
    allows(permission: Permission): boolean;
    /**
     * True if the role may call `method` with `input`. Reads the method's
     * declared `access`: a public method is always allowed, an authenticated
     * one needs a role, and a permission one needs that permission.
     */
    allowsMethod<Input>(method: ServiceMethodContract<Input>, input?: Input): boolean;
};

/**
 * Compose a permission guard over a role. A missing role (an unauthenticated
 * request on an optional-auth route) is allowed nothing.
 */
export function permissionsFor(role: Role | null | undefined): Permissions {
    const allows = (permission: Permission): boolean =>
        role != null ? can(role, permission) : false;

    return {
        allows,
        allowsMethod(method, input) {
            const resolved = resolveAccess(method.access, input);
            if (resolved.kind === 'public') return true;
            if (resolved.kind === 'authenticated') return role != null;
            return allows(resolved.permission);
        },
    };
}
