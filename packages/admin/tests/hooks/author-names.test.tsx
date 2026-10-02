/**
 * @vitest-environment happy-dom
 *
 * `useAuthorNames` maps user ids to names, falling back to the email, and
 * makes no users request at all for a user without `users:read`.
 */

import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthorNames } from '@/admin/hooks/author-names';
import { renderAdminHook } from '../_support/render-admin';

const { queryUsers } = vi.hoisted(() => ({ queryUsers: vi.fn() }));

vi.mock('astromech/fetch', () => ({
    astromechUntypedClient: { users: { query: queryUsers } },
}));

afterEach(() => {
    queryUsers.mockReset();
});

const USERS = [
    { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
    { id: 'u2', name: '', email: 'nameless@example.com' },
];

/** Mount the hook for a signed-in user holding exactly these permissions. */
function mountHook(permissions: string[]) {
    return renderAdminHook(() => useAuthorNames(), { permissions });
}

describe('useAuthorNames', () => {
    it('maps ids to names, using the email when the name is empty', async () => {
        queryUsers.mockResolvedValue({ data: USERS });
        const { result } = mountHook(['users:read']);

        await waitFor(() => {
            expect(result.current.get('u1')).toBe('Ada Lovelace');
        });
        expect(result.current.get('u2')).toBe('nameless@example.com');
    });

    it('reads no users and resolves nothing without the permission', async () => {
        queryUsers.mockResolvedValue({ data: USERS });
        const { result } = mountHook(['entry:post:read']);

        await waitFor(() => {
            expect(result.current.size).toBe(0);
        });
        expect(queryUsers).not.toHaveBeenCalled();
    });
});
