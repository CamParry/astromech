/**
 * Client-side permission checking hook.
 *
 * Mirrors the server-side hasPermission() logic from src/core/permissions.ts.
 * Imported separately to avoid pulling server-only code into the client bundle.
 */

import { useAuth } from '../context/auth.js';

// ============================================================================
// Client-side permission checker (mirrors src/core/permissions.ts)
// ============================================================================

export function hasPermission(permissions: string[], check: string): boolean {
    if (permissions.includes('*')) return true;
    if (permissions.includes(check)) return true;

    const parts = check.split(':');
    if (parts.length === 3) {
        const wildcard = `${parts[0]}:${parts[1]}:*`;
        if (permissions.includes(wildcard)) return true;
    }

    return false;
}

// ============================================================================
// Hook
// ============================================================================

export function usePermissions() {
    const { user } = useAuth();
    const permissions = user?.permissions ?? [];

    return {
        hasPermission: (p: string) => hasPermission(permissions, p),
        canRead: (collection: string) => hasPermission(permissions, `entry:read:${collection}`),
        canCreate: (collection: string) => hasPermission(permissions, `entry:create:${collection}`),
        canUpdate: (collection: string) => hasPermission(permissions, `entry:update:${collection}`),
        canDelete: (collection: string) => hasPermission(permissions, `entry:delete:${collection}`),
        canPublish: (collection: string) => hasPermission(permissions, `entry:publish:${collection}`),
        canReadMedia: () => hasPermission(permissions, 'media:read'),
        canUploadMedia: () => hasPermission(permissions, 'media:upload'),
        canDeleteMedia: () => hasPermission(permissions, 'media:delete'),
        canReadUsers: () => hasPermission(permissions, 'users:read'),
        canCreateUsers: () => hasPermission(permissions, 'users:create'),
        canUpdateUsers: () => hasPermission(permissions, 'users:update'),
        canDeleteUsers: () => hasPermission(permissions, 'users:delete'),
        canReadSettings: () => hasPermission(permissions, 'settings:read'),
        canUpdateSettings: () => hasPermission(permissions, 'settings:update'),
        hasAdminAccess: () => hasPermission(permissions, 'admin:access'),
        isAdmin: () => permissions.includes('*'),
    };
}
