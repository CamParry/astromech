/**
 * Names for the user ids that author columns and version snapshots hold.
 * Only fetched when the current user may read users; without the permission
 * callers render no author rather than a raw id.
 */

import { useMemo } from 'react';
import { usePermissions } from './use-permissions';
import { useUsersQuery } from './users';

/** Names by user id, empty when the current user may not read users. */
export function useAuthorNames(): Map<string, string> {
    const { hasPermission } = usePermissions();
    const { data: usersResult } = useUsersQuery(
        { limit: 'all' },
        { enabled: hasPermission('users:read') }
    );

    return useMemo(() => {
        const names = new Map<string, string>();
        for (const user of usersResult?.data ?? []) {
            names.set(user.id, user.name !== '' ? user.name : user.email);
        }
        return names;
    }, [usersResult]);
}

/** The name for one author id, or undefined when it cannot be resolved. */
export function authorName(
    id: string | null | undefined,
    names: Map<string, string>
): string | undefined {
    if (id == null) return undefined;
    return names.get(id);
}
