import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useAuth } from '../../context/auth.js';
import { usePermissions } from '../../hooks/index.js';
import { UIProvider } from '../../context/ui.js';
import { AppShell } from '../../components/layout/app-shell.js';

export const Route = createFileRoute('/_protected')({
	component: ProtectedLayout,
});

function ProtectedLayout() {
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
}
