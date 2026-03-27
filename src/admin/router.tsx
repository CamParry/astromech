/**
 * TanStack Router configuration for the Astromech admin SPA.
 *
 * All paths are relative to the `basepath` (the configured adminRoute).
 * The actual adminRoute value is injected at build time via the
 * `__ASTROMECH_ADMIN_ROUTE__` define constant.
 *
 * Route structure:
 *   /            → Dashboard (protected)
 *   /login       → Login
 *   /forgot-password → Forgot password
 *   /reset-password  → Reset password
 *   /setup       → First-run setup wizard
 *   /collections/:collection         → Collection list
 *   /collections/:collection/new     → New entry
 *   /collections/:collection/:id     → Edit entry
 *   /media       → Media library
 *   /users       → Users list
 *   /settings    → Settings
 */

import React from 'react';
import {
    createRouter,
    createRootRoute,
    createRoute,
    Outlet,
    Navigate,
} from '@tanstack/react-router';
import { AuthProvider, useAuth } from './context/auth.js';
import { usePermissions } from './hooks/index.js';
import { ThemeProvider } from './context/theme.js';
import { UIProvider } from './context/ui.js';
import { ToastProvider } from './components/ui/toast.js';
import { ApiErrorPanel } from './components/ui/api-error-panel.js';
import { ConfirmProvider } from './components/ui/confirm.js';
import { AppShell } from './components/layout/app-shell.js';
import { LoginPage } from './pages/auth/login.js';
import { ForgotPasswordPage } from './pages/auth/forgot-password.js';
import { ResetPasswordPage } from './pages/auth/reset-password.js';
import { SetupPage } from './pages/auth/setup.js';
import { DashboardPage } from './pages/dashboard.js';
import { CollectionIndexPage } from './pages/collections/index.js';
import { CollectionCreatePage } from './pages/collections/create.js';
import { CollectionEditPage } from './pages/collections/edit.js';
import { CollectionVersionsPage } from './pages/collections/versions.js';
import { UsersIndexPage } from './pages/users/index.js';
import { UserCreatePage } from './pages/users/create.js';
import { UserEditPage } from './pages/users/edit.js';
import { MediaIndexPage } from './pages/media/index.js';
import { MediaEditPage } from './pages/media/edit.js';
import { SettingsPage } from './pages/settings/index.js';

declare const __ASTROMECH_ADMIN_ROUTE__: string;

// ============================================================================
// Root route — wraps everything in ThemeProvider and AuthProvider
// ============================================================================

const rootRoute = createRootRoute({
    component: () => (
        <ThemeProvider>
            <AuthProvider>
                <ToastProvider>
                    <ConfirmProvider>
                        <div id="am-app">
                            <Outlet />
                        </div>
                        <ApiErrorPanel />
                    </ConfirmProvider>
                </ToastProvider>
            </AuthProvider>
        </ThemeProvider>
    ),
});

// ============================================================================
// Auth layout — redirects authenticated users away from auth pages
// ============================================================================

const authLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'auth-layout',
    component: function AuthLayout() {
        const { user, isLoading } = useAuth();

        if (isLoading) {
            return (
                <div className="am-auth">
                    <div className="am-auth__card">
                        <div className="am-auth__brand">
                            <span className="am-auth__logo">Astromech</span>
                        </div>
                        <p className="am-auth__message">Loading…</p>
                    </div>
                </div>
            );
        }

        if (user !== null) {
            return <Navigate to="/" />;
        }

        return <Outlet />;
    },
});

// ============================================================================
// Auth pages
// ============================================================================

const loginRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/login',
    component: LoginPage,
});

const forgotPasswordRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/forgot-password',
    component: ForgotPasswordPage,
});

const resetPasswordRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/reset-password',
    component: ResetPasswordPage,
});

const setupRoute = createRoute({
    getParentRoute: () => authLayoutRoute,
    path: '/setup',
    component: SetupPage,
});

// ============================================================================
// Protected layout — redirects unauthenticated users to login
// ============================================================================

const protectedLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'protected-layout',
    component: function ProtectedLayout() {
        const { user, isLoading } = useAuth();
        const { hasAdminAccess } = usePermissions();

        if (isLoading) {
            return <div className="am-loading" />;
        }

        if (user === null) {
            return <Navigate to="/login" />;
        }

        if (!hasAdminAccess()) {
            return <Navigate to="/login" />;
        }

        return (
            <UIProvider>
                <AppShell />
            </UIProvider>
        );
    },
});

// ============================================================================
// Protected pages
// ============================================================================

const dashboardRoute = createRoute({
    getParentRoute: () => protectedLayoutRoute,
    path: '/',
    component: DashboardPage,
});

const collectionIndexRoute = createRoute({
    getParentRoute: () => protectedLayoutRoute,
    path: '/collections/$collection',
    component: CollectionIndexPage,
});

const collectionCreateRoute = createRoute({
    getParentRoute: () => protectedLayoutRoute,
    path: '/collections/$collection/new',
    component: CollectionCreatePage,
});

const collectionEditRoute = createRoute({
    getParentRoute: () => protectedLayoutRoute,
    path: '/collections/$collection/$id',
    component: CollectionEditPage,
});

const collectionVersionsRoute = createRoute({
    getParentRoute: () => protectedLayoutRoute,
    path: '/collections/$collection/$id/versions',
    component: CollectionVersionsPage,
});

const usersIndexRoute = createRoute({
    getParentRoute: () => protectedLayoutRoute,
    path: '/users',
    component: UsersIndexPage,
});

const userCreateRoute = createRoute({
    getParentRoute: () => protectedLayoutRoute,
    path: '/users/new',
    component: UserCreatePage,
});

const userEditRoute = createRoute({
    getParentRoute: () => protectedLayoutRoute,
    path: '/users/$id',
    component: UserEditPage,
});

const mediaIndexRoute = createRoute({
    getParentRoute: () => protectedLayoutRoute,
    path: '/media',
    component: MediaIndexPage,
});

const mediaEditRoute = createRoute({
    getParentRoute: () => protectedLayoutRoute,
    path: '/media/$id',
    component: MediaEditPage,
});

const settingsRoute = createRoute({
    getParentRoute: () => protectedLayoutRoute,
    path: '/settings',
    component: SettingsPage,
});

// ============================================================================
// Catch-all (404 within SPA)
// ============================================================================

const notFoundRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '*',
    component: () => (
        <div style={{ padding: '2rem' }}>
            <h1>404 — Page not found</h1>
        </div>
    ),
});

// ============================================================================
// Route tree & router
// ============================================================================

const routeTree = rootRoute.addChildren([
    authLayoutRoute.addChildren([
        loginRoute,
        forgotPasswordRoute,
        resetPasswordRoute,
        setupRoute,
    ]),
    protectedLayoutRoute.addChildren([
        dashboardRoute,
        collectionIndexRoute,
        collectionCreateRoute,
        collectionVersionsRoute,
        collectionEditRoute,
        usersIndexRoute,
        userCreateRoute,
        userEditRoute,
        mediaIndexRoute,
        mediaEditRoute,
        settingsRoute,
    ]),
    notFoundRoute,
]);

export const router = createRouter({
    routeTree,
    basepath: __ASTROMECH_ADMIN_ROUTE__,
});

// Module augmentation so TanStack Router infers correct route types
declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}
