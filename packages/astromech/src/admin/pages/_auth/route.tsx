import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { sessionQueryOptions } from '../../context/auth.js';

export const Route = createFileRoute('/_auth')({
    beforeLoad: async ({ context }) => {
        const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
        if (session !== null) {
            throw redirect({ to: '/' });
        }
    },
    pendingComponent: AuthPending,
    pendingMs: 0,
    component: AuthLayout,
});

function AuthPending() {
    return (
        <div className="am-auth">
            <div className="am-auth-card">
                <div className="am-auth-brand">
                    <span className="am-auth-logo">Astromech</span>
                </div>
                <p className="am-auth-message">Loading…</p>
            </div>
        </div>
    );
}

function AuthLayout() {
    return <Outlet />;
}
