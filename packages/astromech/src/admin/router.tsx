import type { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen.js';

declare const __ASTROMECH_ADMIN_ROUTE__: string;

export type RouterContext = {
    queryClient: QueryClient;
};

export function createAppRouter(queryClient: QueryClient) {
    return createRouter({
        routeTree,
        basepath: __ASTROMECH_ADMIN_ROUTE__,
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
