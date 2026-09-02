/**
 * `permissionsFor(role)` — a role composed into a permission guard, the single
 * enforcement seam. The HTTP API composes it; trusted transports (the Local API
 * for SSR/hooks, the CLI) compose nothing and never check.
 */

import type { Permission, Role, ServiceMethodContract } from '@/types/index';
import { can } from '@/permissions/roles';

export type Permissions = {
    /** True if the role holds `permission`. A missing role holds nothing. */
    allows(permission: Permission): boolean;
    /**
     * True if the role may call `method` with `input`. Reads the method's
     * declared `permission` (resolving an input-dependent rule); a method that
     * declares no permission — or whose rule answers `null` for this input —
     * is public and always allowed.
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
            const rule = method.permission;
            if (rule === undefined) return true; // public method — no permission gate
            const permission = typeof rule === 'function' ? rule(input as never) : rule;
            if (permission === null) return true; // public for this input
            return allows(permission);
        },
    };
}
