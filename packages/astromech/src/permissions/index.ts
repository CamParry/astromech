/**
 * Roles & Permission utilities
 *
 * Roles are code-defined (AstromechConfig.roles + built-in defaults).
 * The local transport bypasses permission checks by design — only the HTTP API enforces them.
 */

import type { AstromechConfig, ResolvedConfig } from '@/types/config';
import type { Permission, Role } from '@/types/domain';
import { defineAbsolutePermissions } from '@/permissions/define';
import { hasPermission as hasPermissionImpl } from '@/utilities/permission-match';

export { hasPermission, matchesPermission } from '@/utilities/permission-match';
export { definePermissions } from '@/permissions/define';
export type { PermissionDeclaration, PermissionDeclarations } from '@/permissions/define';
export {
    type EntryAction,
    entryPermission,
    entryPermissions,
    rootEntryPermission,
    pluginEntryPermission,
} from '@/permissions/entry-permission';

type ConfigWithRoles = Pick<AstromechConfig, 'roles'> | Pick<ResolvedConfig, 'roles'>;

/**
 * Every permission core itself enforces — the core half of the permission
 * catalogue, declared through {@link defineAbsolutePermissions} since these
 * keys are already full strings (core is the root namespace).
 */
export const CORE_PERMISSIONS = defineAbsolutePermissions({
    'admin:access': {
        label: 'Access the admin',
        description: 'Sign in to the admin UI. Every admin page requires it.',
    },
    'media:read': { label: 'View media' },
    'media:upload': {
        label: 'Upload media',
        description: 'Add new files to the media library.',
    },
    'media:update': {
        label: 'Update media',
        description: "Edit an existing item's alt text, title and caption.",
    },
    'media:delete': { label: 'Delete media' },
    'settings:read': { label: 'View settings' },
    'settings:update': { label: 'Update settings' },
    'users:read': { label: 'View users' },
    'users:create': { label: 'Create users' },
    'users:update': {
        label: 'Update users',
        description: "Edit a user's profile, role and password.",
    },
    'users:delete': { label: 'Delete users' },
    'entry:read:full': {
        label: 'Read full entry shape',
        description:
            'Read the admin/editor shape of any entry — drafts and unpublished fields included — rather than the public shape.',
    },
});

/** Core permission keys, literal-typed. */
type CorePermissionKey = keyof typeof CORE_PERMISSIONS;

/** Select core permissions by key — a typo is a compile error, not a dead grant. */
function corePermissions(...keys: CorePermissionKey[]): Permission[] {
    return [...keys];
}

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

/**
 * Cross-cutting permission: request the full (admin/editor) shape on any
 * entry read. Covered by `entry:*` (editor) and `*` (admin) via the
 * trailing-wildcard matcher.
 */
export const PERMISSION_ENTRY_READ_FULL = 'entry:read:full' as Permission;

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
    return hasPermissionImpl(role.permissions, permission);
}
