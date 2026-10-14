/**
 * Client-side permission hook. Uses the same segment-wise matcher as the
 * server (`packages/astromech/src/permissions/permission.ts`).
 */

import type { MediaAction, SecurityAction, UserAction } from 'astromech';
import {
    hasPermission,
    mediaPermission,
    securityPermission,
    userPermission,
} from 'astromech/shared';
import { useAuth } from '../context/auth';

export { hasPermission };

/**
 * Permission checks for the signed-in user: `media`, `users` and `security`
 * each answer `can(action)`. Entry types and globals use `useAdminEntryType`
 * and `useAdminGlobal`.
 */
export function usePermissions() {
    const { user } = useAuth();
    const permissions = user?.permissions ?? [];
    const allows = (permission: string) => hasPermission(permissions, permission);

    return {
        hasPermission: allows,
        media: { can: (action: MediaAction) => allows(mediaPermission(action)) },
        users: { can: (action: UserAction) => allows(userPermission(action)) },
        security: { can: (action: SecurityAction) => allows(securityPermission(action)) },
    };
}
