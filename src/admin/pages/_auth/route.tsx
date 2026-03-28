import { createFileRoute, Outlet, Navigate } from '@tanstack/react-router';
import { useAuth } from '../../context/auth.js';

export const Route = createFileRoute('/_auth')({
	component: AuthLayout,
});

function AuthLayout() {
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
}
