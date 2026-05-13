import { createFileRoute, redirect } from '@tanstack/react-router';
import { sessionQueryOptions } from '../../context/auth.js';
import { hasPermission } from '../../hooks/use-permissions.js';
import { UIProvider } from '../../context/ui.js';
import { AppShell } from '../../components/layout/app-shell.js';

export const Route = createFileRoute('/_protected')({
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
		if (session === null || !hasPermission(session.permissions, 'admin:access')) {
			throw redirect({ to: '/login' });
		}
	},
	pendingComponent: () => <div className="am-loading" />,
	pendingMs: 0,
	component: ProtectedLayout,
});

function ProtectedLayout() {
	return (
		<UIProvider>
			<AppShell />
		</UIProvider>
	);
}
