/**
 * @vitest-environment happy-dom
 *
 * The logout route's `beforeLoad` ends the session and sends the visitor to
 * the login page. Being a route, it runs only once the unsaved-changes guard
 * has let the navigation through.
 */

import { QueryClient } from '@tanstack/react-query';
import { isRedirect } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionQueryOptions } from '@/admin/context/auth';
import { Route as logoutRoute } from '@/admin/pages/logout';
import { testUser } from './_support/render-admin';

type BeforeLoad = (arg: {
    context: { queryClient: QueryClient };
    preload: boolean;
}) => Promise<unknown>;

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    vi.stubGlobal('__ASTROMECH_BASE_PATH__', '/cms');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
});

afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

/** A query client holding a signed-in session. */
function signedIn(): QueryClient {
    const queryClient = new QueryClient();
    queryClient.setQueryData(sessionQueryOptions.queryKey, testUser(['*']));
    return queryClient;
}

/** Run the logout route's `beforeLoad` and return the path it redirected to, or null. */
async function runBeforeLoad(queryClient: QueryClient, preload = false) {
    const beforeLoad = logoutRoute.options.beforeLoad as unknown as BeforeLoad;
    try {
        await beforeLoad({ context: { queryClient }, preload });
        return null;
    } catch (error) {
        if (!isRedirect(error)) throw error;
        return (error as unknown as { options: { to?: string } }).options.to ?? null;
    }
}

describe('the logout route', () => {
    it('signs out, clears the session and redirects to the login page', async () => {
        const queryClient = signedIn();

        expect(await runBeforeLoad(queryClient)).toBe('/login');
        expect(fetchMock).toHaveBeenCalledWith('/cms/api/auth/sign-out', {
            method: 'POST',
            credentials: 'include',
        });
        expect(queryClient.getQueryData(sessionQueryOptions.queryKey)).toBeNull();
    });

    it('does nothing when the route is only preloaded', async () => {
        const queryClient = signedIn();

        expect(await runBeforeLoad(queryClient, true)).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(queryClient.getQueryData(sessionQueryOptions.queryKey)).not.toBeNull();
    });
});
