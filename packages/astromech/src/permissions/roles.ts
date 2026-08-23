/**
 * Roles — the built-in set, the merge with the config's own, and the check of
 * a role against a permission.
 *
 * Roles are code-defined (`AstromechConfig.roles` plus the built-in defaults).
 * The local transport bypasses permission checks by design — only the HTTP API
 * enforces them.
 */

import type { AstromechConfig, ResolvedConfig } from '@/types/config';
import type { Permission, Role } from '@/types/domain';
import { corePermissions } from '@/permissions/core-permissions';
import { hasPermission } from '@/utilities/permission-match';

type ConfigWithRoles = Pick<AstromechConfig, 'roles'> | Pick<ResolvedConfig, 'roles'>;

// Wildcards are matcher features, not grantable units, so they are literals
// here rather than members of CORE_PERMISSIONS. The `entry:*` wildcard covers
// all entry types and actions, including `entry:read:full`.
const EDITOR_PERMISSIONS: Permission[] = [
    ...corePermissions(
        'admin:access',
        'media:read',
        'media:upload',
        'media:update',
        'media:delete'
    ),
    'entry:*',
];

export const BUILT_IN_ROLES = {
    // `*` is the global matcher, not a declared permission — it grants every
    // core key and every plugin key that will ever exist.
    admin: { name: 'Administrator', permissions: ['*'], isBuiltIn: true },
    editor: { name: 'Editor', permissions: EDITOR_PERMISSIONS, isBuiltIn: true },
} satisfies Record<string, Omit<Role, 'slug'>>;

export type BuiltInRoleSlug = keyof typeof BUILT_IN_ROLES;

/**
 * The role a user created without an explicit one gets. `editor` is the
 * least-privileged built-in — `admin` holds `*`, so defaulting to it would hand
 * every grant to any write path that forgot to name a role.
 */
export const DEFAULT_ROLE_SLUG = 'editor' satisfies BuiltInRoleSlug;

/** Copy of a built-in role's permissions, for spreading into config roles. */
export function permissionsForBuiltInRole(slug: BuiltInRoleSlug): Permission[] {
    const role = BUILT_IN_ROLES[slug];
    if (!role) {
        throw new Error(
            `Unknown built-in role "${slug}". Available: ${Object.keys(BUILT_IN_ROLES).join(', ')}`
        );
    }
    return [...role.permissions];
}

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
export function resolveRole(
    config: Pick<ResolvedConfig, 'resolvedRoles'>,
    slug: string
): Role {
    const roles = config.resolvedRoles;
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

/** Convenience wrapper: check whether a role grants a permission. */
export function can(role: Role, permission: Permission): boolean {
    return hasPermission(role.permissions, permission);
}
