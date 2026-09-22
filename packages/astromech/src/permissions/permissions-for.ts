/**
 * `permissionsFor(role)` — a role composed into a permission guard, the single
 * enforcement seam. The HTTP API composes it; trusted transports (the Local API
 * for SSR/hooks, the CLI) compose nothing and never check.
 */

import type { ResolvedAccess } from '@/permissions/access';
import type { Permission, Role, ServiceMethodContract } from '@/types/index';
import { resolveAccess } from '@/permissions/access';
import { can } from '@/permissions/roles';

export type Permissions = {
    /** True if the role holds `permission`. A missing role holds nothing. */
    allows(permission: Permission): boolean;
    /**
     * True if the role meets `access`, already resolved for one call: public is
     * always met, authenticated needs a role, and permissions need every one of them.
     */
    allowsAccess(access: ResolvedAccess): boolean;
    /**
     * True if the role may call `method` with `input`. Reads the method's
     * declared `access`: a public method is always allowed, an authenticated
     * one needs a role, and a permission one needs that permission.
     */
    allowsMethod(method: ServiceMethodContract, input?: unknown): boolean;
};

/**
 * Compose a permission guard over a role. A missing role (an unauthenticated
 * request on an optional-auth route) is allowed nothing.
 */
export function permissionsFor(role: Role | null | undefined): Permissions {
    const allows = (permission: Permission): boolean =>
        role != null ? can(role, permission) : false;

    const allowsAccess = (access: ResolvedAccess): boolean => {
        if (access.kind === 'public') return true;
        if (access.kind === 'authenticated') return role != null;
        return access.permissions.every(allows);
    };

    return {
        allows,
        allowsAccess,
        allowsMethod: (method, input) =>
            allowsAccess(resolveAccess(method.access, input)),
    };
}
