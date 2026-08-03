/**
 * Roles & Permission utilities
 *
 * Roles are code-defined (AstromechConfig.roles + built-in defaults).
 * The local transport bypasses permission checks by design — only the HTTP API enforces them.
 */

import type { AstromechConfig, ResolvedConfig } from '@/types/config.js';
import type { Permission, Role } from '@/types/domain.js';

import { defineAbsolutePermissions } from '@/permissions/define.js';
import { hasPermission as hasPermissionImpl } from '@/utilities/permission-match.js';
export { hasPermission, matchesPermission } from '@/utilities/permission-match.js';
export { definePermissions } from '@/permissions/define.js';
export type {
    PermissionDeclaration,
    PermissionDeclarations,
} from '@/permissions/define.js';
export {
    type EntryAction,
    entryPermission,
    entryPermissions,
    rootEntryPermission,
    pluginEntryPermission,
} from '@/permissions/entry-permission.js';

type ConfigWithRoles = Pick<AstromechConfig, 'roles'> | Pick<ResolvedConfig, 'roles'>;

// ============================================================================
// Core permissions
// ============================================================================

/**
 * Every permission core itself enforces — the core half of the permission
 * catalogue, and the set the built-in roles select from.
 *
 * Declared through {@link defineAbsolutePermissions} because these keys are the
 * full permission strings: core is the root namespace, so there is nothing to
 * prefix them with. Entry permissions are absent by design — they are derived
 * per registered type (`entryPermission`), not declared.
 */
export const CORE_PERMISSIONS = defineAbsolutePermissions({
    'admin:access': {
        label: 'Access the admin',
        description: 'Sign in to the admin UI. Every admin page requires it.',
    },
    'media:read': { label: 'View media' },
    'media:upload': {
        label: 'Upload media',
        description: 'Upload new files and update existing media metadata.',
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
    'content:translate': {
        label: 'Translate content with a model',
        description:
            'Run the model-driven translate operation. Reaches an entry only where the caller also holds update on that entry type.',
    },
    'content:transform': {
        label: 'Rewrite content with a model',
        description:
            'Run the model-driven transform operation. Reaches an entry only where the caller also holds update on that entry type.',
    },
    'content:generate': {
        label: 'Generate content with a model',
        description:
            'Run the model-driven generate operation. Reaches an entry only where the caller also holds update on that entry type.',
    },
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

// ============================================================================
// Built-in Roles
// ============================================================================

// Wildcards are matcher features, not grantable units, so they are literals
// here rather than members of CORE_PERMISSIONS. The `entry:*` trailing wildcard
// covers all entry types and all actions, including cross-cutting permissions
// like `entry:read:full`.
//
// The content operations are granted because an editor already holds `entry:*`,
// which is the other half of the gate they pass through, and because they stage
// rather than publish.
const EDITOR_PERMISSIONS: Permission[] = [
    ...corePermissions(
        'admin:access',
        'media:read',
        'media:upload',
        'media:delete',
        'content:translate',
        'content:transform',
        'content:generate'
    ),
    'entry:*',
];

/**
 * Cross-cutting permission: request the full (admin/editor) shape on any
 * entry read. Covered by `entry:*` (editor) and `*` (admin) via the trailing-
 * wildcard matcher — future member/anonymous roles that lack `entry:*` will
 * not have this permission.
 */
export const PERMISSION_ENTRY_READ_FULL = 'entry:read:full' as Permission;

export const BUILT_IN_ROLES = {
    // `*` is the global matcher, not a declared permission — it grants every
    // core key and every plugin key that will ever exist.
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
