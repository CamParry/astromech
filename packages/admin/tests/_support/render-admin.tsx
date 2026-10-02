/**
 * Renders admin UI inside what the app mounts around it: a query client, a
 * router, the root route's providers and the protected layout's, signed in as
 * a user holding the permissions the test names.
 */

import type { AuthUser } from '@/admin/context/auth';
import type { PluginUiIdentity } from '@/admin/context/plugin';
import type { RouteComponent } from '@tanstack/react-router';
import type { RenderHookResult, RenderResult } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';
import { act, render, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import { ToastProvider } from '@/admin/components/ui/toast';
import { AiContextProvider } from '@/admin/context/ai-context';
import { AuthProvider, sessionQueryOptions } from '@/admin/context/auth';
import { PluginUiProvider } from '@/admin/context/plugin';
import { ThemeProvider } from '@/admin/context/theme';
import { UiProvider } from '@/admin/context/ui';
import '@/admin/rendering/cells/register-cells';
import '@/admin/rendering/register-fields';

/** What `renderAdmin` and `renderWithProviders` take. */
export type RenderAdminOptions = {
    /** The URL the router starts at. Defaults to `/`. */
    url?: string;
    /**
     * The signed-in user's permissions, seeded as the session `GET /api/me`
     * would answer. `null` renders signed out. Defaults to `['*']`.
     */
    permissions?: string[] | null;
    /** Overrides for the rest of the signed-in user, such as their `id`. */
    session?: Partial<Omit<AuthUser, 'permissions'>>;
    /** A query client the test seeded. Defaults to a fresh `createTestQueryClient()`. */
    queryClient?: QueryClient;
};

/**
 * One route of a test's own route tree, for UI that reads route params or a
 * validated search. Its component reads them with `useParams({ strict: false })`.
 */
export type TestRoute = {
    path: string;
    component: RouteComponent;
    validateSearch?: (search: Record<string, unknown>) => Record<string, unknown>;
};

/** What `renderAdmin` returns. */
export type RenderAdminResult = RenderResult & {
    queryClient: QueryClient;
    /** A user-event instance with no delay between keystrokes. */
    user: UserEvent;
    /** Where the router is now, as `pathname?search`. */
    location(): string;
    /** Where the router is now, without the search. */
    pathname(): string;
    /** The router's current search, parsed. */
    search(): Record<string, unknown>;
    /** Navigate the router to `to`, as a link or `useNavigate` would. */
    navigate(to: string): Promise<void>;
};

/**
 * A query client set up as the app's, minus retries, so a failed request
 * fails the query at once.
 */
export function createTestQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: { staleTime: 30_000, retry: false },
            mutations: { retry: 0 },
        },
    });
}

/**
 * Render `ui` at `options.url` inside a router and the admin's providers. Given
 * an element, any path renders it, so a page can navigate and `location()`
 * reads where it went; given routes, the router matches them.
 */
export function renderAdmin(
    ui: ReactElement | TestRoute[],
    options: RenderAdminOptions = {}
): RenderAdminResult {
    const queryClient = seededClient(options);
    const rootRoute = createRootRoute({
        component: () => (
            <AppProviders>
                <Outlet />
            </AppProviders>
        ),
    });
    const routes = (
        Array.isArray(ui) ? ui : ['/', '$'].map((path) => ({ path, component: () => ui }))
    ).map((route) => createRoute({ getParentRoute: () => rootRoute, ...route }));
    const router = createRouter({
        routeTree: rootRoute.addChildren(routes),
        history: createMemoryHistory({ initialEntries: [options.url ?? '/'] }),
    });

    const result = render(
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    );
    return {
        ...result,
        queryClient,
        user: userEvent.setup({ delay: null }),
        location: () => router.state.location.href,
        pathname: () => router.state.location.pathname,
        search: () => router.state.location.search,
        navigate: async (to) => {
            await act(async () => {
                await router.navigate({ to });
            });
        },
    };
}

/** What `renderPluginPage` takes. */
export type RenderPluginPageOptions = RenderAdminOptions & {
    /** The plugin whose surface is rendering, as the admin's plugin routes supply it. */
    plugin: PluginUiIdentity;
    /**
     * The plugin's English bundle, loaded under its `permissionNamespace` as
     * `src/i18n.ts` loads it, so the page shows the text a user reads.
     */
    translations?: Record<string, unknown>;
};

/**
 * Render a plugin's admin page as `renderAdmin` renders admin UI, inside the
 * `PluginUiProvider` the admin's plugin routes wrap it in, so
 * `useAstromechPlugin()` works.
 */
export function renderPluginPage(
    page: ReactElement,
    { plugin, translations, ...options }: RenderPluginPageOptions
): RenderAdminResult {
    if (translations !== undefined) {
        i18n.addResourceBundle('en', plugin.permissionNamespace, translations);
    }
    return renderAdmin(
        <PluginUiProvider identity={plugin}>{page}</PluginUiProvider>,
        options
    );
}

/**
 * Render `ui` inside the admin's providers with no router, for a component that
 * reads none of the router's state.
 */
export function renderWithProviders(
    ui: ReactElement,
    options: Omit<RenderAdminOptions, 'url'> = {}
): RenderResult & { queryClient: QueryClient; user: UserEvent } {
    const queryClient = seededClient(options);
    const result = render(
        <QueryClientProvider client={queryClient}>
            <AppProviders>{ui}</AppProviders>
        </QueryClientProvider>
    );
    return { ...result, queryClient, user: userEvent.setup({ delay: null }) };
}

/** Run `hook` inside the admin's providers with no router, as `renderWithProviders` renders. */
export function renderAdminHook<T>(
    hook: () => T,
    options: Omit<RenderAdminOptions, 'url'> = {}
): RenderHookResult<T, unknown> & { queryClient: QueryClient } {
    const queryClient = seededClient(options);
    const result = renderHook(hook, {
        wrapper: ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <AppProviders>{children}</AppProviders>
            </QueryClientProvider>
        ),
    });
    return { ...result, queryClient };
}

/** The signed-in user `renderAdmin` seeds, holding `permissions`. */
export function testUser(permissions: string[]): AuthUser {
    return {
        id: 'u1',
        name: 'Admin',
        email: 'admin@astromech.dev',
        image: null,
        role: 'admin',
        permissions,
    };
}

/** The test's client, or a fresh one, with the session seeded. */
function seededClient(options: RenderAdminOptions): QueryClient {
    const queryClient = options.queryClient ?? createTestQueryClient();
    const permissions = options.permissions === undefined ? ['*'] : options.permissions;
    queryClient.setQueryData<AuthUser | null>(
        sessionQueryOptions.queryKey,
        permissions === null ? null : { ...testUser(permissions), ...options.session }
    );
    return queryClient;
}

/** The root route's providers, then the protected layout's, as the app nests them. */
function AppProviders({ children }: { children: ReactNode }) {
    return (
        <ThemeProvider>
            <AuthProvider>
                <ToastProvider>
                    <ConfirmProvider>
                        <UiProvider>
                            <AiContextProvider>{children}</AiContextProvider>
                        </UiProvider>
                    </ConfirmProvider>
                </ToastProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}
