/**
 * @vitest-environment happy-dom
 *
 * The login route's `beforeLoad` sends a visitor to first-run setup while the
 * install has no users, and leaves the login form in place when the check fails.
 */

import { QueryClient } from '@tanstack/react-query';
import { isRedirect } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupCheckQueryOptions } from '@/admin/context/auth';
import { Route as loginRoute } from '@/admin/pages/_auth/login';

type BeforeLoad = (arg: { context: { queryClient: QueryClient } }) => Promise<unknown>;

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    vi.stubGlobal('__ASTROMECH_BASE_PATH__', '/cms');
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

/** Run the login route's `beforeLoad` and return the path it redirected to, or null. */
async function runBeforeLoad(queryClient = new QueryClient()): Promise<string | null> {
    const beforeLoad = loginRoute.options.beforeLoad as unknown as BeforeLoad;
    try {
        await beforeLoad({ context: { queryClient } });
        return null;
    } catch (error) {
        if (!isRedirect(error)) throw error;
        return (error as unknown as { options: { to?: string } }).options.to ?? null;
    }
}

function answerSetupCheck(body: unknown, status = 200): void {
    fetchMock.mockResolvedValue(
        new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        })
    );
}

describe('the login route', () => {
    it('redirects to setup while the install has no users', async () => {
        answerSetupCheck({ needsSetup: true });

        expect(await runBeforeLoad()).toBe('/setup');
        expect(fetchMock).toHaveBeenCalledWith('/cms/api/setup/check', expect.anything());
    });

    it('stays on the login form once a user exists', async () => {
        answerSetupCheck({ needsSetup: false });

        expect(await runBeforeLoad()).toBeNull();
    });

    it('stays on the login form when the check answers an error', async () => {
        answerSetupCheck({ error: { code: 'INTERNAL_ERROR' } }, 500);

        expect(await runBeforeLoad()).toBeNull();
    });

    it('stays on the login form when the check cannot be reached', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

        expect(await runBeforeLoad()).toBeNull();
    });

    // The setup page writes this answer once it has created the first account.
    it('reads a cached answer rather than asking again', async () => {
        const queryClient = new QueryClient();
        queryClient.setQueryData(setupCheckQueryOptions.queryKey, { needsSetup: false });

        expect(await runBeforeLoad(queryClient)).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
