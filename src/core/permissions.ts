/**
 * Roles & Permission utilities
 *
 * Roles are code-defined (AstromechConfig.roles + built-in defaults).
 * The server SDK bypasses permission checks by design — only the HTTP API enforces them.
 */

import type { AstromechConfig, ResolvedConfig } from '@/types/config.js';
import type { Permission, Role } from '@/types/domain.js';

import { hasPermission as hasPermissionImpl } from '@/core/permission-match.js';
export { hasPermission, matchesPermission } from '@/core/permission-match.js';

type ConfigWithRoles = Pick<AstromechConfig, 'roles'> | Pick<ResolvedConfig, 'roles'>;

// ============================================================================
// Built-in Roles
// ============================================================================

// `entry:*` trailing wildcard covers all entry types and all actions.
const EDITOR_PERMISSIONS: Permission[] = [
    'admin:access',
    'entry:*',
    'media:read',
    'media:upload',
    'media:delete',
];

export const BUILT_IN_ROLES: Record<string, Omit<Role, 'slug'>> = {
    admin: {
        name: 'Administrator',
        permissions: ['*'],
        isBuiltIn: true,
    },
    editor: {
        name: 'Editor',
        permissions: EDITOR_PERMISSIONS,
        isBuiltIn: true,
    },
};

// ============================================================================
// Resolution
// ============================================================================

/** Merge built-in roles with config-defined roles. Config roles take precedence. */
export function resolveRoles(config: ConfigWithRoles): Record<string, Role> {
    const result: Record<string, Role> = {};

    // Built-ins first
    for (const [slug, role] of Object.entries(BUILT_IN_ROLES)) {
        result[slug] = { slug, ...role };
    }

    // Config-defined roles override / add to built-ins
    if (config.roles) {
        for (const [slug, roleConfig] of Object.entries(config.roles)) {
            result[slug] = {
                slug,
                name: roleConfig.name,
                permissions: roleConfig.permissions,
                isBuiltIn: false,
            };
        }
    }

    return result;
}

/** Look up a single role by slug. Returns the admin role as fallback. */
export function resolveRole(config: ConfigWithRoles, slug: string): Role {
    const roles = resolveRoles(config);
    return (
        roles[slug] ??
        roles['admin'] ?? {
            slug: 'admin',
            name: 'Administrator',
            permissions: ['*'],
            isBuiltIn: true,
        }
    );
}

// ============================================================================
// Permission Checking (segment-wise matcher re-exported from permission-match.ts)
// ============================================================================

/** Convenience wrapper: check whether a role grants a permission. */
export function can(role: Role, permission: Permission): boolean {
    return hasPermissionImpl(role.permissions, permission);
}
