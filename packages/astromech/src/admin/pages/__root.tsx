import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { AuthProvider } from '../context/auth.js';
import { ThemeProvider } from '../context/theme.js';
import { ToastProvider } from '../components/ui/toast.js';
import { ApiErrorPanel } from '../components/ui/api-error-panel.js';
import { ConfirmProvider } from '../components/ui/confirm.js';
import type { RouterContext } from '../router.js';

export const Route = createRootRouteWithContext<RouterContext>()({
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
