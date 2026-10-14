/**
 * The permission grammar: the `Permission` string, the segment-wise matcher,
 * and the declarations a plugin makes its own permissions grantable with.
 * Pure, so the admin reaches the matcher through `astromech/shared`.
 */

/**
 * Permission strings follow `resource[:identifier]:action` — action always last.
 * Segment wildcards: `*` matches one segment; trailing `*` matches all remaining segments.
 *
 * Examples: `entry:posts:read`, `entry:*:read`, `entry:*`, `plugin:my-plugin:*`
 */
export type Permission =
    | 'entry:*'
    | `entry:${string}:create`
    | `entry:${string}:read`
    | `entry:${string}:update`
    | `entry:${string}:delete`
    | `entry:${string}:publish`
    | `entry:${string}:*`
    | 'media:read'
    | 'media:upload'
    | 'media:update'
    | 'media:delete'
    | 'users:read'
    | 'users:create'
    | 'users:update'
    | 'users:delete'
    | 'security:manage'
    | 'admin:access'
    | `plugin:${string}`
    | '*'
    | (string & {});

/**
 * Segment-wise permission matching: `resource[:identifier]:action` joined
 * by `:`. `*` alone grants everything, mid-pattern matches one segment, and
 * a trailing `*` matches one or more remaining segments.
 */
export function matchesPermission(pattern: string, check: string): boolean {
    if (pattern === '*') return true;
    const patternSegments = pattern.split(':');
    const checkSegments = check.split(':');
    for (let i = 0; i < patternSegments.length; i++) {
        const segment = patternSegments[i] ?? '';
        if (segment === '*' && i === patternSegments.length - 1) {
            return checkSegments.length > i;
        }
        if (i >= checkSegments.length) return false;
        if (segment !== '*' && segment !== checkSegments[i]) return false;
    }
    return patternSegments.length === checkSegments.length;
}

/** Check whether any pattern in a permissions array grants the requested permission. */
export function hasPermission(permissions: readonly string[], check: string): boolean {
    return permissions.some((pattern) => matchesPermission(pattern, check));
}

/** One grantable permission: what a matrix view shows for it. */
export type PermissionDeclaration = {
    label: string;
    description?: string;
};

/** A flat declaration keyed by permission key. */
export type PermissionDeclarations = Record<string, PermissionDeclaration>;

/**
 * Declare the permissions a plugin makes grantable. Keys stay literal, so
 * `plugin.permissions('read')` type-checks and a typo does not. Core namespaces
 * each key at registration, so a key is ONE LEVEL DEEP: a `:` is a crash-loud
 * error.
 */
export function definePermissions<const D extends PermissionDeclarations>(
    declaration: D
): D {
    for (const key of Object.keys(declaration)) {
        if (key.includes(':')) {
            throw new Error(
                `Invalid permission key "${key}": permission keys are one level deep and must not contain ":". ` +
                    `Core namespaces the key at registration (a plugin key becomes \`plugin:<namespace>:<key>\`), ` +
                    `and entry permissions are derived from the registered entry types rather than declared.`
            );
        }
    }
    return declaration;
}
