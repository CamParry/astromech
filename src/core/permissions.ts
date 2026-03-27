/**
 * Roles & Permission utilities
 *
 * Roles are code-defined (AstromechConfig.roles + built-in defaults).
 * The server SDK bypasses permission checks by design — only the HTTP API enforces them.
 */

import type { AstromechConfig, ResolvedConfig } from '@/types/config.js';
import type { Permission, Role } from '@/types/domain.js';

type ConfigWithRoles = Pick<AstromechConfig, 'roles'> | Pick<ResolvedConfig, 'roles'>;

// ============================================================================
// Built-in Roles
// ============================================================================

const EDITOR_PERMISSIONS: Permission[] = [
    'admin:access',
    'entry:create:*',
    'entry:read:*',
    'entry:update:*',
    'entry:delete:*',
    'entry:publish:*',
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
    return roles[slug] ?? roles['admin'] ?? { slug: 'admin', name: 'Administrator', permissions: ['*'], isBuiltIn: true };
}

// ============================================================================
// Permission Checking
// ============================================================================

/**
 * Check if a permissions array grants the requested permission.
 *
 * Handles:
 * - Exact match: 'entry:read:posts' in permissions
 * - Global wildcard: '*' in permissions → grants everything
 * - Scope wildcard: 'entry:read:*' in permissions → grants 'entry:read:posts'
 */
export function hasPermission(permissions: Permission[], check: Permission): boolean {
    if (permissions.includes('*' as Permission)) return true;
    if (permissions.includes(check)) return true;

    // Handle scope wildcard: entry:read:* covers entry:read:posts
    const parts = check.split(':');
    if (parts.length === 3) {
        const wildcard = `${parts[0]}:${parts[1]}:*` as Permission;
        if (permissions.includes(wildcard)) return true;
    }

    return false;
}

/** Convenience wrapper: check whether a role grants a permission. */
export function can(role: Role, permission: Permission): boolean {
    return hasPermission(role.permissions, permission);
}
