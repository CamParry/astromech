/**
 * Client-side permission hook. Uses the same segment-wise matcher as the
 * server (src/utilities/permission-match.ts).
 */

import { hasPermission } from 'astromech/shared';
import { useAuth } from '../context/auth';

export { hasPermission };

/** Permission checks for the signed-in user. Entry types and globals use `useAdminEntryType` and `useAdminGlobal`. */
export function usePermissions() {
    const { user } = useAuth();
    const permissions = user?.permissions ?? [];

    return {
        hasPermission: (p: string) => hasPermission(permissions, p),
        canReadMedia: () => hasPermission(permissions, 'media:read'),
        canUploadMedia: () => hasPermission(permissions, 'media:upload'),
        canUpdateMedia: () => hasPermission(permissions, 'media:update'),
        canDeleteMedia: () => hasPermission(permissions, 'media:delete'),
        canReadUsers: () => hasPermission(permissions, 'users:read'),
        canCreateUsers: () => hasPermission(permissions, 'users:create'),
        canUpdateUsers: () => hasPermission(permissions, 'users:update'),
        canDeleteUsers: () => hasPermission(permissions, 'users:delete'),
        hasAdminAccess: () => hasPermission(permissions, 'admin:access'),
        isAdmin: () => permissions.includes('*'),
    };
}
