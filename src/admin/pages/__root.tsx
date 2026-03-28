import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AuthProvider } from '../context/auth.js';
import { ThemeProvider } from '../context/theme.js';
import { ToastProvider } from '../components/ui/toast.js';
import { ApiErrorPanel } from '../components/ui/api-error-panel.js';
import { ConfirmProvider } from '../components/ui/confirm.js';

export const Route = createRootRoute({
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
