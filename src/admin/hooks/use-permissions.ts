/**
 * Client-side permission hook. Uses the same segment-wise matcher as the
 * server (src/support/permission-match.ts).
 */

import { hasPermission } from '@/support/permission-match.js';
import { useAuth } from '../context/auth.js';

export { hasPermission };

// ============================================================================
// Hook
// ============================================================================

export function usePermissions() {
    const { user } = useAuth();
    const permissions = user?.permissions ?? [];

    return {
        hasPermission: (p: string) => hasPermission(permissions, p),
        canRead: (collection: string) =>
            hasPermission(permissions, `entry:${collection}:read`),
        canCreate: (collection: string) =>
            hasPermission(permissions, `entry:${collection}:create`),
        canUpdate: (collection: string) =>
            hasPermission(permissions, `entry:${collection}:update`),
        canDelete: (collection: string) =>
            hasPermission(permissions, `entry:${collection}:delete`),
        canPublish: (collection: string) =>
            hasPermission(permissions, `entry:${collection}:publish`),
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
