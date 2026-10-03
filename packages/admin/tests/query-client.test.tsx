/**
 * The admin's query client signs the user out on a 401 from any query or
 * mutation: it clears the cached session and opens the login page, whose guard
 * then keeps the user there rather than sending them back into the app.
 *
 * @vitest-environment happy-dom
 */

import type { RenderAdminResult } from './_support/render-admin';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery } from '@tanstack/react-query';
import { isRedirect } from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import { AstromechApiError, astromechUntypedClient } from 'astromech/fetch';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionQueryOptions } from '@/admin/context/auth';
import { Route as authRoute } from '@/admin/pages/_auth/route';
import { createAppQueryClient } from '@/admin/query-client';
import { renderAdmin } from './_support/render-admin';

const { query, remove } = vi.hoisted(() => ({ query: vi.fn(), remove: vi.fn() }));

vi.mock('astromech/fetch', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    astromechUntypedClient: { users: { query, delete: remove } },
}));

afterEach(() => {
    query.mockReset();
    remove.mockReset();
});

/** The error the client throws for a response with `status`. */
function apiError(status: number): AstromechApiError {
    return new AstromechApiError({
        id: 'err-1',
        code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
        message: status === 401 ? 'Authentication required' : 'Forbidden',
        status,
    });
}

function UsersCount() {
    const users = useQuery({
        queryKey: ['users'],
        queryFn: () => astromechUntypedClient.users.query({}),
    });
    return <p>{users.isSuccess ? 'Users loaded' : 'Loading users'}</p>;
}

function DeleteUser() {
    const deletion = useMutation({
        mutationFn: () => astromechUntypedClient.users.delete({ id: 'u2' }),
    });
    return (
        <>
            <button type="button" onClick={() => deletion.mutate()}>
                Delete user
            </button>
            {deletion.isError && <p>Could not delete user</p>}
        </>
    );
}

/** The app's query client and a router holding `component` at `/` and a login page. */
function renderApp(component: () => React.ReactElement): {
    app: RenderAdminResult;
    queryClient: QueryClient;
} {
    // The router is built after the client, as `main.tsx` builds the app's.
    const queryClient = createAppQueryClient({
        onUnauthorized: () => void app.navigate('/login'),
    });
    const app = renderAdmin(
        [
            { path: '/', component },
            { path: '/login', component: () => <h1>Sign in</h1> },
        ],
        { queryClient }
    );
    return { app, queryClient };
}

/** Run the login layout's guard and return where it redirected, or null. */
async function runAuthGuard(queryClient: QueryClient): Promise<string | null> {
    const beforeLoad = authRoute.options.beforeLoad as unknown as (arg: {
        context: { queryClient: QueryClient };
    }) => Promise<unknown>;
    try {
        await beforeLoad({ context: { queryClient } });
        return null;
    } catch (error) {
        if (!isRedirect(error)) throw error;
        return (error as unknown as { options: { to?: string } }).options.to ?? null;
    }
}

describe('createAppQueryClient', () => {
    it('signs out and opens the login page when a query answers 401', async () => {
        query.mockRejectedValue(apiError(401));
        const { app, queryClient } = renderApp(UsersCount);

        expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();

        expect(app.pathname()).toBe('/login');
        expect(queryClient.getQueryData(sessionQueryOptions.queryKey)).toBeNull();
        expect(query).toHaveBeenCalledTimes(1);
        expect(await runAuthGuard(queryClient)).toBeNull();
    });

    it('signs out and opens the login page when a mutation answers 401', async () => {
        remove.mockRejectedValue(apiError(401));
        const { app, queryClient } = renderApp(DeleteUser);

        await app.user.click(await screen.findByRole('button', { name: 'Delete user' }));

        expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
        expect(queryClient.getQueryData(sessionQueryOptions.queryKey)).toBeNull();
    });

    it('keeps the session on any other error', async () => {
        remove.mockRejectedValue(apiError(403));
        const { app, queryClient } = renderApp(DeleteUser);

        await app.user.click(await screen.findByRole('button', { name: 'Delete user' }));

        expect(await screen.findByText('Could not delete user')).toBeTruthy();

        expect(app.pathname()).toBe('/');
        expect(queryClient.getQueryData(sessionQueryOptions.queryKey)).toMatchObject({
            id: 'u1',
        });
    });
});
