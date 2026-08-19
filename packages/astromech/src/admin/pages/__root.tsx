import type { RouterContext } from '../router';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { ApiErrorPanel } from '../components/ui/api-error-panel';
import { ConfirmProvider } from '../components/ui/confirm';
import { ToastProvider } from '../components/ui/toast';
import { AuthProvider } from '../context/auth';
import { ThemeProvider } from '../context/theme';

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
