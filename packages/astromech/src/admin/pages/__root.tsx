import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { AuthProvider } from '../context/auth';
import { ThemeProvider } from '../context/theme';
import { ToastProvider } from '../components/ui/toast';
import { ApiErrorPanel } from '../components/ui/api-error-panel';
import { ConfirmProvider } from '../components/ui/confirm';
import type { RouterContext } from '../router';

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
