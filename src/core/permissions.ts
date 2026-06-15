/**
 * Roles & Permission utilities
 *
 * Roles are code-defined (AstromechConfig.roles + built-in defaults).
 * The server SDK bypasses permission checks by design — only the HTTP API enforces them.
 */

import type { AstromechConfig, ResolvedConfig } from '@/types/config.js';
import type { Permission, Role } from '@/types/domain.js';

import { hasPermission as hasPermissionImpl } from '@/core/permission-match.js';
import { sanitisePackage } from '@/core/plugin-identity.js';
export { hasPermission, matchesPermission } from '@/core/permission-match.js';

type ConfigWithRoles = Pick<AstromechConfig, 'roles'> | Pick<ResolvedConfig, 'roles'>;

// ============================================================================
// Built-in Roles
// ============================================================================

// `entry:*` trailing wildcard covers all entry types and all actions,
// including cross-cutting permissions like `entry:read:full`.
const EDITOR_PERMISSIONS: Permission[] = [
    'admin:access',
    'entry:*',
    'media:read',
    'media:upload',
    'media:delete',
];

/**
 * Cross-cutting permission: request the full (admin/editor) shape on any
 * entry read. Covered by `entry:*` (editor) and `*` (admin) via the trailing-
 * wildcard matcher — future member/anonymous roles that lack `entry:*` will
 * not have this permission.
 */
export const PERMISSION_ENTRY_READ_FULL = 'entry:read:full' as Permission;

export const BUILT_IN_ROLES = {
    admin: { name: 'Administrator', permissions: ['*'], isBuiltIn: true },
    editor: { name: 'Editor', permissions: EDITOR_PERMISSIONS, isBuiltIn: true },
} satisfies Record<string, Omit<Role, 'slug'>>;

export type BuiltInRoleSlug = keyof typeof BUILT_IN_ROLES;

/** Copy of a built-in role's permissions, for spreading into config roles. */
export function builtInRole(slug: BuiltInRoleSlug): Permission[] {
    const role = BUILT_IN_ROLES[slug];
    if (!role) {
        throw new Error(
            `Unknown built-in role "${slug}". Available: ${Object.keys(BUILT_IN_ROLES).join(', ')}`
        );
    }
    return [...role.permissions];
}

/**
 * Define named permission bundles for a plugin. Every bundle entry is
 * prefixed `plugin:{ns}:` (ns = sanitised package) — including keys that
 * already contain `:`, so nested keys like `entry:redirect:read` become
 * `plugin:{ns}:entry:redirect:read`. Bundles never grant core permissions;
 * users compose those via builtInRole() or literals.
 */
export function definePermissionBundles<
    const B extends Record<string, readonly string[]>,
>(pkg: string, bundles: B): (bundle: keyof B & string) => Permission[] {
    const namespace = sanitisePackage(pkg);
    return (bundle) => {
        const keys = bundles[bundle];
        if (!keys) {
            throw new Error(
                `Unknown permission bundle "${bundle}" for ${pkg}. Available: ${Object.keys(bundles).join(', ')}`
            );
        }
        return keys.map((key) => `plugin:${namespace}:${key}` as Permission);
    };
}

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
