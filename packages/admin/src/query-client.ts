/** The query client the admin SPA mounts with. */

import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { AstromechApiError } from 'astromech/fetch';
import { sessionQueryOptions } from './context/auth';

/**
 * The admin's query client. A 401 from any query or mutation means the session
 * is gone (signed out elsewhere, user deleted, database restored), so it clears
 * the cached session before `onUnauthorized` sends the user to the login page.
 */
export function createAppQueryClient({
    onUnauthorized,
}: {
    onUnauthorized: () => void;
}): QueryClient {
    function onError(error: unknown): void {
        if (!isUnauthorized(error)) return;
        // Cleared first, so the login route's guard does not send a user it
        // still thinks is signed in back into the app.
        queryClient.setQueryData(sessionQueryOptions.queryKey, null);
        onUnauthorized();
    }

    const queryClient = new QueryClient({
        queryCache: new QueryCache({ onError }),
        mutationCache: new MutationCache({ onError }),
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                retry: (failureCount, error) =>
                    failureCount < 1 && !isUnauthorized(error),
            },
            mutations: {
                retry: 0,
            },
        },
    });
    return queryClient;
}

function isUnauthorized(error: unknown): boolean {
    return error instanceof AstromechApiError && error.status === 401;
}
