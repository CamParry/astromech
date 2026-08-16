import type { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

declare const __ASTROMECH_BASE_PATH__: string;

export type RouterContext = {
    queryClient: QueryClient;
};

export function createAppRouter(queryClient: QueryClient) {
    return createRouter({
        routeTree,
        basepath: __ASTROMECH_BASE_PATH__,
        context: { queryClient } satisfies RouterContext,
        defaultNotFoundComponent: () => <div>Page not found</div>,
    });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Register {
        router: AppRouter;
    }
}
